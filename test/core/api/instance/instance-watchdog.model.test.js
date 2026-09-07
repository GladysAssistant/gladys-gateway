const { expect } = require('chai');
const tracer = require('tracer');
const InstanceWatchdogModel = require('../../../../core/api/instance/instance-watchdog.model');

const silentLogger = tracer.colorConsole({ level: 'fatal' });

const INSTANCE_ID = '0bc53f3c-1e11-40d3-99a4-bd392a666eaf';
const USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';

// Unit tests of the error paths of the watchdog, with a fake database, socket cluster and
// mail service (the happy paths are covered end to end in instance-watchdog.test.js)
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
  function fakeDb(instances) {
    const userUpdates = [];
    const instanceUpdates = [];
    return {
      userUpdates,
      instanceUpdates,
      query: async (sql, params) => {
        if (sql.startsWith('UPDATE t_instance')) {
          instanceUpdates.push(params);
          return [];
        }
        return instances;
      },
      t_user: {
        update: async (where, values) => {
          userUpdates.push({ where, values });
          return [{ id: where.id }];
        },
      },
    };
  }

  function fakeUser(values = {}) {
    return {
      id: USER_ID,
      email: 'tony@gladysassistant.com',
      name: 'Tony',
      language: 'en',
      enabled: true,
      delay_in_minutes: 60,
      alert_sent_at: null,
      ...values,
    };
  }

  function fakeInstance(values = {}) {
    return {
      id: INSTANCE_ID,
      name: 'Raspberry Pi',
      account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      last_seen_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
      users: [fakeUser()],
      ...values,
    };
  }

  function recordingMailService() {
    const sentEmails = [];
    return {
      sentEmails,
      send: async (user, template, scope) => {
        sentEmails.push({ user, template, scope });
      },
    };
  }

  it('should build the offline email from the user as the job carries it', async () => {
    const db = fakeDb([fakeInstance({ users: [fakeUser({ delay_in_minutes: 90, language: 'fr' })] })]);
    const socketModel = { getConnectedInstanceIds: async () => new Set() };
    const mailService = recordingMailService();
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ alerts: 1, errors: 0 });
    expect(mailService.sentEmails).to.have.lengthOf(1);
    const [email] = mailService.sentEmails;
    expect(email.user).to.deep.equal({ email: 'tony@gladysassistant.com', language: 'fr' });
    expect(email.template).to.equal('instance_offline');
    expect(email.scope).to.include({ firstname: 'Tony', instanceName: 'Raspberry Pi', alertDelay: '1 h 30 min' });
    expect(email.scope.offlineFor).to.equal('2 h');
    expect(email.scope.lastSeenDate).to.match(/UTC$/);
    expect(db.userUpdates).to.have.lengthOf(1);
    expect(db.userUpdates[0].where).to.deep.equal({ id: USER_ID });
    expect(db.userUpdates[0].values.instance_offline_alert_sent_at).to.be.a('date');
  });

  it('should report an error and keep the outage open when the email cannot be sent', async () => {
    const db = fakeDb([fakeInstance()]);
    const socketModel = { getConnectedInstanceIds: async () => new Set() };
    const mailService = {
      send: async () => {
        throw new Error('SMTP unreachable');
      },
    };
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ execute: true, total: 1, offline: 1, alerts: 0, errors: 1 });
    expect(report.instances).to.have.lengthOf(1);
    expect(report.instances[0].users).to.deep.equal([
      { id: USER_ID, delay_in_minutes: 60, action: 'error', error: 'SMTP unreachable' },
    ]);
    // the email did not leave: the alert is not recorded, it will be retried on the next run
    expect(db.userUpdates).to.deep.equal([]);
    expect(db.instanceUpdates).to.deep.equal([]);
  });

  it('should keep the outage start of a connected instance whose back online email failed', async () => {
    const outageStart = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const otherInstanceId = 'd28a4e3e-ac60-44f7-bdfe-8c9deafa51d3';
    const db = fakeDb([
      fakeInstance({ last_seen_at: outageStart, users: [fakeUser({ alert_sent_at: new Date() })] }),
      // another connected instance, with nothing to report: its heartbeat is written
      fakeInstance({ id: otherInstanceId, name: 'Other', users: [] }),
    ]);
    const socketModel = { getConnectedInstanceIds: async () => new Set([INSTANCE_ID, otherInstanceId]) };
    const mailService = {
      send: async () => {
        throw new Error('SMTP unreachable');
      },
    };
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ total: 2, connected: 2, back_online: 0, errors: 1 });
    expect(report.instances[0].users).to.deep.equal([
      { id: USER_ID, delay_in_minutes: 60, action: 'error', error: 'SMTP unreachable' },
    ]);
    // the outage stays open with its real start, so the retry can tell the right downtime
    expect(db.userUpdates).to.deep.equal([]);
    expect(db.instanceUpdates).to.have.lengthOf(1);
    expect(db.instanceUpdates[0][1]).to.deep.equal([otherInstanceId]);
  });

  it('should abort when a whole fleet looks offline, as the socket cluster is suspect', async () => {
    const instances = Array.from({ length: 10 }, (_, index) =>
      fakeInstance({ id: `00000000-0000-4000-8000-00000000000${index}`, name: `Instance ${index}` }),
    );
    const db = fakeDb(instances);
    const socketModel = { getConnectedInstanceIds: async () => new Set() };
    const mailService = recordingMailService();
    const watchdog = InstanceWatchdogModel(silentLogger, db, socketModel, mailService);

    const report = await watchdog.run({ execute: true });

    expect(report).to.deep.include({ aborted: 'no_instance_connected', total: 10, connected: 0, alerts: 0 });
    expect(report.instances).to.deep.equal([]);
    expect(mailService.sentEmails).to.deep.equal([]);
    expect(db.userUpdates).to.deep.equal([]);

    // with a single instance connected, the fleet is checked as usual
    socketModel.getConnectedInstanceIds = async () => new Set([instances[0].id]);
    const secondReport = await watchdog.run({ execute: true });
    expect(secondReport).to.not.have.property('aborted');
    expect(secondReport).to.deep.include({ total: 10, connected: 1, offline: 9, alerts: 9 });
  });
});
