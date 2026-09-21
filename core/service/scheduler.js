const cron = require('node-cron');

// The lock outlives the job by far: replicas of the server all fire at the same minute and
// the first one to take the lock runs the job, the others find it taken. It expires by
// itself, so a replica that dies mid-job never blocks the next run.
const LOCK_TTL_IN_SECONDS = 60 * 60;
const DISABLED_VALUES = ['', 'false', 'disabled', 'off'];

/**
 * Recurring jobs living in the server itself, instead of an external cron calling the admin
 * API. Every job is guarded by a Redis lock so that only one replica of the server runs it.
 * A job is configured by a cron expression in an environment variable; set it to "disabled"
 * to turn the job off (tests, a replica that must not send emails...).
 */
module.exports = function SchedulerService(logger, redisClient, adminAccountLifecycleModel) {
  const tasks = [];

  function getSchedule(envName, defaultSchedule) {
    const schedule = process.env[envName] === undefined ? defaultSchedule : process.env[envName].trim();
    if (DISABLED_VALUES.includes(schedule.toLowerCase())) {
      return null;
    }
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression in ${envName}: "${schedule}"`);
    }
    return schedule;
  }

  /**
   * Run a job once, unless another replica did in the last hour. Never throws: a failing job
   * is logged and retried at the next tick.
   */
  async function runWithLock(name, job) {
    const lockKey = `scheduler:${name}:lock`;
    let locked;
    try {
      locked = await redisClient.set(lockKey, new Date().toISOString(), { NX: true, EX: LOCK_TTL_IN_SECONDS });
    } catch (e) {
      logger.warn(`scheduler: unable to take the lock of ${name}, skipping this run`);
      logger.warn(e);
      return { name, ran: false, reason: 'lock_error' };
    }
    if (locked !== 'OK') {
      logger.info(`scheduler: ${name} already ran on another replica, skipping this run`);
      return { name, ran: false, reason: 'already_ran' };
    }
    logger.info(`scheduler: running ${name}`);
    try {
      const report = await job();
      logger.info(`scheduler: ${name} done`);
      return { name, ran: true, report };
    } catch (e) {
      logger.error(`scheduler: ${name} failed`);
      logger.error(e);
      return { name, ran: false, reason: 'job_error', error: e };
    }
  }

  function sendActivationReminders() {
    return runWithLock('activation-reminders', async () => {
      const report = await adminAccountLifecycleModel.sendActivationReminders({ execute: true });
      logger.info(
        `scheduler: activation reminders sent (total=${report.total}, reminded=${report.reminded}, skipped=${report.skipped}, errors=${report.errors})`,
      );
      return report;
    });
  }

  function sendRecoveryCodesReminders() {
    return runWithLock('recovery-codes-reminders', async () => {
      const report = await adminAccountLifecycleModel.sendRecoveryCodesReminders({ execute: true });
      logger.info(
        `scheduler: recovery codes reminders sent (total=${report.total}, reminded=${report.reminded}, errors=${report.errors})`,
      );
      return report;
    });
  }

  function scheduleJob(name, envName, defaultSchedule, job) {
    const schedule = getSchedule(envName, defaultSchedule);
    if (schedule === null) {
      logger.info(`scheduler: ${name} is disabled (${envName})`);
      return null;
    }
    const task = cron.schedule(schedule, job, { name, noOverlap: true });
    tasks.push(task);
    logger.info(`scheduler: ${name} scheduled ("${schedule}", timezone ${process.env.TZ || 'system'})`);
    return task;
  }

  /**
   * Schedule every job. Throws on an invalid cron expression, so a misconfigured server
   * refuses to start rather than silently never running its jobs.
   */
  function start() {
    return {
      activationReminders: scheduleJob(
        'activation-reminders',
        'ACCOUNT_ACTIVATION_REMINDER_CRON',
        '0 9 * * *',
        sendActivationReminders,
      ),
      recoveryCodesReminders: scheduleJob(
        'recovery-codes-reminders',
        'RECOVERY_CODES_REMINDER_CRON',
        '30 9 * * *',
        sendRecoveryCodesReminders,
      ),
    };
  }

  function stop() {
    tasks.splice(0).forEach((task) => task.destroy());
  }

  return {
    start,
    stop,
    runWithLock,
    sendActivationReminders,
    sendRecoveryCodesReminders,
  };
};
