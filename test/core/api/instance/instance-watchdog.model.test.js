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

  it('should report an error and keep the outage open when the email cannot be sent', async () => {
    const userUpdates = [];
    const instanceUpdates = [];
    const db = {
      query: async (sql, params) => {
        if (sql.startsWith('UPDATE t_instance')) {
          instanceUpdates.push(params);
          return [];
        }
        return [
          {
            id: INSTANCE_ID,
            name: 'Raspberry Pi',
            account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
            last_seen_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
            users: [
              {
                id: USER_ID,
                email: 'tony@gladysassistant.com',
                name: 'Tony',
                language: 'en',
                enabled: true,
                delay_in_minutes: 60,
                alert_sent_at: null,
              },
            ],
          },
        ];
      },
      t_user: {
        update: async (where, values) => {
          userUpdates.push({ where, values });
          return [{ id: where.id }];
        },
      },
    };
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
    expect(userUpdates).to.deep.equal([]);
    expect(instanceUpdates).to.deep.equal([]);
  });
});
