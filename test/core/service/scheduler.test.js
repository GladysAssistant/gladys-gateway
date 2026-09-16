const { expect } = require('chai');

const SchedulerService = require('../../../core/service/scheduler');

const silentLogger = { info() {}, warn() {}, error() {} };

function fakeLifecycleModel(behavior = async () => ({ total: 0, reminded: 0, skipped: 0, errors: 0 })) {
  const calls = [];
  return {
    calls,
    sendActivationReminders: async (body) => {
      calls.push(body);
      return behavior(body);
    },
  };
}

describe('scheduler service', () => {
  const previousSchedule = process.env.ACCOUNT_ACTIVATION_REMINDER_CRON;
  let scheduler;

  afterEach(() => {
    process.env.ACCOUNT_ACTIVATION_REMINDER_CRON = previousSchedule;
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

  it('should not schedule a job set to disabled', () => {
    process.env.ACCOUNT_ACTIVATION_REMINDER_CRON = 'disabled';
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, fakeLifecycleModel());
    expect(scheduler.start()).to.deep.equal({ activationReminders: null });
  });

  it('should refuse to start with an invalid cron expression', () => {
    process.env.ACCOUNT_ACTIVATION_REMINDER_CRON = 'every day at nine';
    scheduler = SchedulerService(silentLogger, TEST_REDIS_CLIENT, fakeLifecycleModel());
    expect(() => scheduler.start()).to.throw(/ACCOUNT_ACTIVATION_REMINDER_CRON/);
  });
});
