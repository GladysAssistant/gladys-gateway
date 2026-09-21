const { expect } = require('chai');

const SchedulerService = require('../../../core/service/scheduler');

const silentLogger = { info() {}, warn() {}, error() {} };

const WATCHDOG_REPORT = { total: 3, connected: 3, offline: 0, alerts: 0, back_online: 0, errors: 0 };

function fakeWatchdogModel(behavior = async () => WATCHDOG_REPORT) {
  const calls = [];
  return {
    calls,
    run: async (body) => {
      calls.push(body);
      return behavior(body);
    },
  };
}

function fakeLifecycleModel(behavior = async () => ({ total: 0, reminded: 0, skipped: 0, errors: 0 })) {
  const calls = [];
  return {
    calls,
    sendActivationReminders: async (body) => {
      calls.push(body);
      return behavior(body);
    },
    sendRecoveryCodesReminders: async (body) => {
      calls.push(body);
      return behavior(body);
    },
  };
}

const SCHEDULE_ENV_NAMES = [
  'ACCOUNT_ACTIVATION_REMINDER_CRON',
  'RECOVERY_CODES_REMINDER_CRON',
  'INSTANCE_WATCHDOG_CRON',
];

describe('scheduler service', () => {
  // The schedules are "disabled" by the test bootstrap: each test restores them afterwards
  const previousSchedules = {};
  let scheduler;

  before(() => {
    SCHEDULE_ENV_NAMES.forEach((name) => {
      previousSchedules[name] = process.env[name];
    });
  });

  afterEach(() => {
    SCHEDULE_ENV_NAMES.forEach((name) => {
      if (previousSchedules[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previousSchedules[name];
      }
    });
    if (scheduler) {
      scheduler.stop();
      scheduler = null;
    }
  });

  it('should run the activation reminders with execute and keep the lock', async () => {
    const model = fakeLifecycleModel();
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, model);
    const result = await scheduler.sendActivationReminders();
    expect(result).to.deep.include({ name: 'activation-reminders', ran: true });
    expect(result.report).to.deep.equal({ total: 0, reminded: 0, skipped: 0, errors: 0 });
    expect(model.calls).to.deep.equal([{ execute: true }]);
    const ttl = await TEST_REDIS_CLIENT.ttl('scheduler:activation-reminders:lock');
    expect(ttl).to.be.within(3500, 3600);
  });

  it('should run the recovery codes reminders with execute, under their own lock', async () => {
    const model = fakeLifecycleModel(async () => ({ total: 2, reminded: 2, errors: 0 }));
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, model);
    const result = await scheduler.sendRecoveryCodesReminders();
    expect(result).to.deep.include({ name: 'recovery-codes-reminders', ran: true });
    expect(result.report).to.deep.equal({ total: 2, reminded: 2, errors: 0 });
    expect(model.calls).to.deep.equal([{ execute: true }]);
    const ttl = await TEST_REDIS_CLIENT.ttl('scheduler:recovery-codes-reminders:lock');
    expect(ttl).to.be.within(3500, 3600);
    // the lock of one job never blocks the other one
    const activationResult = await scheduler.sendActivationReminders();
    expect(activationResult).to.deep.include({ name: 'activation-reminders', ran: true });
  });

  it('should run the instance watchdog with execute, under a lock shorter than its schedule', async () => {
    const watchdog = fakeWatchdogModel();
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, fakeLifecycleModel(), watchdog);
    const result = await scheduler.runInstanceWatchdog();
    expect(result).to.deep.include({ name: 'instance-watchdog', ran: true });
    expect(result.report).to.deep.include({ total: 3, connected: 3 });
    expect(watchdog.calls).to.deep.equal([{ execute: true }]);
    // the job runs every 5 minutes: the lock is gone before the next tick
    const ttl = await TEST_REDIS_CLIENT.ttl('scheduler:instance-watchdog:lock');
    expect(ttl).to.be.within(200, 240);
    const again = await scheduler.runInstanceWatchdog();
    expect(again).to.deep.equal({ name: 'instance-watchdog', ran: false, reason: 'already_ran' });
    expect(watchdog.calls).to.have.lengthOf(1);
  });

  it('should log an aborted instance watchdog run as a successful run, to retry at the next tick', async () => {
    const watchdog = fakeWatchdogModel(async () => ({ aborted: 'no_instance_connected', total: 12, connected: 0 }));
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, fakeLifecycleModel(), watchdog);
    const result = await scheduler.runInstanceWatchdog();
    expect(result).to.deep.include({ name: 'instance-watchdog', ran: true });
    expect(result.report.aborted).to.equal('no_instance_connected');
  });

  it('should not run the job again while another replica holds the lock', async () => {
    const model = fakeLifecycleModel();
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, model);
    await scheduler.sendActivationReminders();
    const result = await scheduler.sendActivationReminders();
    expect(result).to.deep.equal({ name: 'activation-reminders', ran: false, reason: 'already_ran' });
    expect(model.calls).to.have.lengthOf(1);
  });

  it('should not throw when the job fails, and keep the lock for the next replica', async () => {
    const model = fakeLifecycleModel(async () => {
      throw new Error('database down');
    });
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, model);
    const result = await scheduler.sendActivationReminders();
    expect(result).to.include({ name: 'activation-reminders', ran: false, reason: 'job_error' });
    expect(result.error.message).to.equal('database down');
  });

  it('should skip the run when the lock cannot be taken', async () => {
    const model = fakeLifecycleModel();
    const brokenRedis = {
      set: async () => {
        throw new Error('redis down');
      },
    };
    scheduler = SchedulerService(silentLogger, brokenRedis, model);
    const result = await scheduler.sendActivationReminders();
    expect(result).to.deep.equal({ name: 'activation-reminders', ran: false, reason: 'lock_error' });
    expect(model.calls).to.have.lengthOf(0);
  });

  it('should schedule the activation reminders daily by default and run them from the cron task', async () => {
    delete process.env.ACCOUNT_ACTIVATION_REMINDER_CRON;
    const model = fakeLifecycleModel();
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, model);
    const { activationReminders } = scheduler.start();
    expect(activationReminders).to.not.equal(null);
    expect(activationReminders.getNextRun().getUTCMinutes()).to.equal(0);
    // the task fires the job on the clock; executed by hand here
    await activationReminders.execute();
    expect(model.calls).to.deep.equal([{ execute: true }]);
  });

  it('should schedule the recovery codes reminders daily by default and run them from the cron task', async () => {
    delete process.env.RECOVERY_CODES_REMINDER_CRON;
    const model = fakeLifecycleModel();
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, model);
    const { recoveryCodesReminders } = scheduler.start();
    expect(recoveryCodesReminders).to.not.equal(null);
    expect(recoveryCodesReminders.getNextRun().getUTCMinutes()).to.equal(30);
    await recoveryCodesReminders.execute();
    expect(model.calls).to.deep.equal([{ execute: true }]);
  });

  it('should schedule the instance watchdog every 5 minutes by default and run it from the cron task', async () => {
    delete process.env.INSTANCE_WATCHDOG_CRON;
    const watchdog = fakeWatchdogModel();
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, fakeLifecycleModel(), watchdog);
    const { instanceWatchdog } = scheduler.start();
    expect(instanceWatchdog).to.not.equal(null);
    expect(instanceWatchdog.getNextRun().getUTCMinutes() % 5).to.equal(0);
    await instanceWatchdog.execute();
    expect(watchdog.calls).to.deep.equal([{ execute: true }]);
  });

  it('should not schedule a job set to disabled', () => {
    process.env.ACCOUNT_ACTIVATION_REMINDER_CRON = 'disabled';
    process.env.RECOVERY_CODES_REMINDER_CRON = 'disabled';
    process.env.INSTANCE_WATCHDOG_CRON = 'disabled';
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, fakeLifecycleModel(), fakeWatchdogModel());
    expect(scheduler.start()).to.deep.equal({
      activationReminders: null,
      recoveryCodesReminders: null,
      instanceWatchdog: null,
    });
  });

  it('should refuse to start with an invalid cron expression', () => {
    process.env.ACCOUNT_ACTIVATION_REMINDER_CRON = 'every day at nine';
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, fakeLifecycleModel());
    expect(() => scheduler.start()).to.throw(/ACCOUNT_ACTIVATION_REMINDER_CRON/);
    process.env.ACCOUNT_ACTIVATION_REMINDER_CRON = 'disabled';
    process.env.RECOVERY_CODES_REMINDER_CRON = 'every quarter';
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, fakeLifecycleModel());
    expect(() => scheduler.start()).to.throw(/RECOVERY_CODES_REMINDER_CRON/);
    process.env.RECOVERY_CODES_REMINDER_CRON = 'disabled';
    process.env.INSTANCE_WATCHDOG_CRON = 'every 5 minutes';
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, fakeLifecycleModel(), fakeWatchdogModel());
    expect(() => scheduler.start()).to.throw(/INSTANCE_WATCHDOG_CRON/);
  });
});
