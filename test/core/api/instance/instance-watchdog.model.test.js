const { expect } = require('chai');
const tracer = require('tracer');
const InstanceWatchdogModel = require('../../../../core/api/instance/instance-watchdog.model');

const silentLogger = tracer.colorConsole({ level: 'fatal' });

const INSTANCE_ID = '0bc53f3c-1e11-40d3-99a4-bd392a666eaf';
const ACCOUNT_ID = 'b2d23f66-487d-493f-8acb-9c8adb400def';
const ADMIN_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
const OTHER_ADMIN_ID = 'bdb1a902-a65e-46f9-8c2a-5c09840e2e10';

// Unit tests of the error and concurrency paths of the watchdog, with a fake database,
// socket cluster and mail service (the happy paths are covered end to end in
// instance-watchdog.test.js)
describe('instance watchdog model', () => {
  it('should not throw when the disconnection cannot be recorded', async () => {
    const db = {
      t_instance: {
        update: async () => {
          throw new Error('database is down');
        },
      },
    };
    const watchdog = InstanceWatchdogModel(silentLogger, db, {}, {});
    await watchdog.markInstanceDisconnected(INSTANCE_ID);
  });

  // Fake database: the instances the watchdog query returns, and the writes it performs
  function fakeDb(instances, { claimRefused = false } = {}) {
    const accountUpdates = [];
    const instanceUpdates = [];
    return {
      accountUpdates,
      instanceUpdates,
      query: async (sql, params) => {
        if (sql.startsWith('UPDATE t_instance')) {
          instanceUpdates.push(params);
          return [];
        }
        return instances;
      },
      t_account: {
        // the claim of an email is a conditional update: claimed unless told otherwise
        update: async (where, values) => {
          accountUpdates.push({ where, values });
          return claimRefused ? [] : [{ id: where.id }];
        },
      },
    };
  }

  function fakeAdmin(values = {}) {
    return { id: ADMIN_ID, email: 'tony@gladysassistant.com', name: 'Tony', language: 'en', ...values };
  }

  function fakeInstance(values = {}) {
    return {
      id: INSTANCE_ID,
      name: 'Raspberry Pi',
      account_id: ACCOUNT_ID,
      last_seen_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
      enabled: true,
      delay_in_minutes: 60,
      alert_sent_at: null,
      admins: [fakeAdmin()],
      ...values,
    };
  }

  function recordingMailService(failingEmails = []) {
    const sentEmails = [];
    return {
      sentEmails,
      send: async (user, template, scope) => {
        if (failingEmails.includes(user.email)) {
          throw new Error('SMTP unreachable');
        }
        sentEmails.push({ user, template, scope });
      },
    };
  }

  it('should email every admin of the account, built from the account as the job carries it', async () => {
    const admins = [
      fakeAdmin({ language: 'fr' }),
      fakeAdmin({ id: OTHER_ADMIN_ID, email: 'pepper@gladysassistant.com' }),
    ];
    const db = fakeDb([fakeInstance({ delay_in_minutes: 90, admins })]);
    const socketModel = { getConnectedInstanceIds: async () => new Set() };
    const mailService = recordingMailService();
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ alerts: 1, errors: 0 });
    expect(report.instances[0]).to.deep.include({
      action: 'alert',
      enabled: true,
      delay_in_minutes: 90,
      recipients: [
        { id: ADMIN_ID, status: 'sent' },
        { id: OTHER_ADMIN_ID, status: 'sent' },
      ],
    });
    expect(mailService.sentEmails).to.have.lengthOf(2);
    const [email] = mailService.sentEmails;
    expect(email.user).to.deep.equal({ email: 'tony@gladysassistant.com', language: 'fr' });
    expect(email.template).to.equal('instance_offline');
    expect(email.scope).to.include({ firstname: 'Tony', instanceName: 'Raspberry Pi', alertDelay: '1 h 30 min' });
    expect(email.scope.offlineFor).to.equal('2 h');
    expect(email.scope.lastSeenDate).to.match(/UTC$/);
    // the alert is claimed on the account before the emails leave, only when no alert is open
    expect(db.accountUpdates).to.have.lengthOf(1);
    expect(db.accountUpdates[0].where).to.deep.equal({ id: ACCOUNT_ID, instance_offline_alert_sent_at: null });
    expect(db.accountUpdates[0].values.instance_offline_alert_sent_at).to.be.a('date');
  });

  it('should keep the alert when at least one admin received it', async () => {
    const admins = [fakeAdmin(), fakeAdmin({ id: OTHER_ADMIN_ID, email: 'bounce@gladysassistant.com' })];
    const db = fakeDb([fakeInstance({ admins })]);
    const socketModel = { getConnectedInstanceIds: async () => new Set() };
    const mailService = recordingMailService(['bounce@gladysassistant.com']);
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ alerts: 1, errors: 0 });
    expect(report.instances[0].recipients).to.deep.equal([
      { id: ADMIN_ID, status: 'sent' },
      { id: OTHER_ADMIN_ID, status: 'error', error: 'SMTP unreachable' },
    ]);
    expect(db.accountUpdates).to.have.lengthOf(1);
  });

  it('should report an error and keep the outage open when no email could be sent', async () => {
    const db = fakeDb([fakeInstance()]);
    const socketModel = { getConnectedInstanceIds: async () => new Set() };
    const mailService = recordingMailService(['tony@gladysassistant.com']);
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ execute: true, total: 1, offline: 1, alerts: 0, errors: 1 });
    expect(report.instances).to.have.lengthOf(1);
    expect(report.instances[0]).to.deep.include({
      action: 'error',
      recipients: [{ id: ADMIN_ID, status: 'error', error: 'SMTP unreachable' }],
    });
    // the email did not leave: the claim is released, the alert will be retried on the next run
    expect(db.accountUpdates).to.have.lengthOf(2);
    expect(db.accountUpdates[0].where).to.deep.equal({ id: ACCOUNT_ID, instance_offline_alert_sent_at: null });
    expect(db.accountUpdates[1].where).to.deep.equal({
      id: ACCOUNT_ID,
      instance_offline_alert_sent_at: db.accountUpdates[0].values.instance_offline_alert_sent_at,
    });
    expect(db.accountUpdates[1].values).to.deep.equal({ instance_offline_alert_sent_at: null });
    expect(db.instanceUpdates).to.deep.equal([]);
  });

  it('should not email when a concurrent run claimed the alert first', async () => {
    const db = fakeDb([fakeInstance()], { claimRefused: true });
    const socketModel = { getConnectedInstanceIds: async () => new Set() };
    const mailService = recordingMailService();
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ alerts: 0, errors: 0 });
    expect(report.instances[0]).to.include({ action: 'already_alerted' });
    expect(mailService.sentEmails).to.deep.equal([]);
  });

  it('should not email when a concurrent run closed the outage first', async () => {
    const db = fakeDb([fakeInstance({ alert_sent_at: new Date() })], { claimRefused: true });
    const socketModel = { getConnectedInstanceIds: async () => new Set([INSTANCE_ID]) };
    const mailService = recordingMailService();
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ connected: 1, back_online: 0, errors: 0 });
    expect(report.instances).to.deep.equal([]);
    expect(mailService.sentEmails).to.deep.equal([]);
    // the outage is closed: the heartbeat of the connected instance is written
    expect(db.instanceUpdates).to.have.lengthOf(1);
  });

  it('should report an offline instance without any confirmed admin to warn', async () => {
    const db = fakeDb([fakeInstance({ admins: [] })]);
    const socketModel = { getConnectedInstanceIds: async () => new Set() };
    const mailService = recordingMailService();
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ alerts: 0, errors: 0 });
    expect(report.instances[0]).to.deep.include({ action: 'no_recipient', recipients: [] });
    expect(db.accountUpdates).to.deep.equal([]);
  });

  it('should keep the outage start of a connected instance whose back online email failed', async () => {
    const outageStart = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const alertSentAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const otherInstanceId = 'd28a4e3e-ac60-44f7-bdfe-8c9deafa51d3';
    const db = fakeDb([
      fakeInstance({ last_seen_at: outageStart, alert_sent_at: alertSentAt }),
      // another connected instance, with nothing to report: its heartbeat is written
      fakeInstance({ id: otherInstanceId, name: 'Other', account_id: 'other-account', enabled: false }),
    ]);
    const socketModel = { getConnectedInstanceIds: async () => new Set([INSTANCE_ID, otherInstanceId]) };
    const mailService = recordingMailService(['tony@gladysassistant.com']);
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ total: 2, connected: 2, back_online: 0, errors: 1 });
    expect(report.instances).to.have.lengthOf(1);
    expect(report.instances[0]).to.deep.include({
      id: INSTANCE_ID,
      action: 'error',
      recipients: [{ id: ADMIN_ID, status: 'error', error: 'SMTP unreachable' }],
    });
    // the outage stays open with its real start, so the retry can tell the right downtime
    expect(db.accountUpdates).to.have.lengthOf(2);
    expect(db.accountUpdates[0].where).to.deep.equal({ id: ACCOUNT_ID, 'instance_offline_alert_sent_at is not': null });
    expect(db.accountUpdates[0].values).to.deep.equal({ instance_offline_alert_sent_at: null });
    expect(db.accountUpdates[1].where).to.deep.equal({ id: ACCOUNT_ID, instance_offline_alert_sent_at: null });
    expect(db.accountUpdates[1].values).to.deep.equal({ instance_offline_alert_sent_at: alertSentAt });
    expect(db.instanceUpdates).to.have.lengthOf(1);
    expect(db.instanceUpdates[0][1]).to.deep.equal([otherInstanceId]);
  });

  it('should abort when a whole fleet looks offline, as the socket cluster is suspect', async () => {
    const instances = Array.from({ length: 10 }, (_, index) =>
      fakeInstance({
        id: `00000000-0000-4000-8000-00000000000${index}`,
        name: `Instance ${index}`,
        account_id: `account-${index}`,
      }),
    );
    const db = fakeDb(instances);
    const socketModel = { getConnectedInstanceIds: async () => new Set() };
    const mailService = recordingMailService();
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ aborted: 'no_instance_connected', total: 10, connected: 0, alerts: 0 });
    expect(report.instances).to.deep.equal([]);
    expect(mailService.sentEmails).to.deep.equal([]);
    expect(db.accountUpdates).to.deep.equal([]);

    // with a single instance connected, the fleet is checked as usual
    socketModel.getConnectedInstanceIds = async () => new Set([instances[0].id]);
    const secondReport = await watchdog.run({ execute: true });
    expect(secondReport).to.not.have.property('aborted');
    expect(secondReport).to.deep.include({ total: 10, connected: 1, offline: 9, alerts: 9 });
  });
});
