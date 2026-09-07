const Promise = require('bluebird');
const { ValidationError } = require('../../common/error');
const { adminLifecycleJobSchema } = require('../../common/schema');
const {
  buildInstanceOfflineScope,
  buildInstanceBackOnlineScope,
  minutesBetween,
} = require('../../common/instance-email-scope');

// Statuses under which the customer has access to Gladys Plus (see checkUserPlan middleware).
// An instance of a churned account is offline for good: nobody should be emailed about it.
const ACTIVE_STATUSES = ['active', 'trialing'];

// Fail closed: from this many primary instances, none of them connected means the socket
// cluster is not answering (partitioned node, adapter issue), not that every customer is
// offline at once. Below it (dev, tests), a fully offline fleet is a normal situation.
function getFailClosedMinInstances() {
  const parsed = parseInt(process.env.INSTANCE_WATCHDOG_FAIL_CLOSED_MIN_INSTANCES, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 10;
}

/**
 * Instance watchdog ("is my Gladys alive?"). The gateway is the only party that can tell a
 * user his home is unreachable, precisely because the home itself cannot: power cut, dead
 * SD card, internet box down while on holidays.
 *
 * Two sources feed t_instance.last_seen_at: the websocket disconnect of the instance (exact
 * time it went away) and the job below, which refreshes the instances still connected (so
 * a gateway node crashing, where no disconnect event is emitted, does not leave a stale
 * date behind). The users opt in per user (t_user.instance_offline_alert_enabled) with
 * their own delay, and t_user.instance_offline_alert_sent_at tracks the outage reported to
 * them: set when the "offline" email is sent, cleared when the "back online" one is.
 */
module.exports = function InstanceWatchdogModel(logger, db, socketModel, mailService) {
  function validateJobBody(body) {
    const { error, value } = adminLifecycleJobSchema.validate(body || {}, { stripUnknown: true, abortEarly: false });
    if (error) {
      throw new ValidationError('instance_watchdog_job', error);
    }
    return value;
  }

  /**
   * The websocket of the instance was closed: it was reachable until now. Called from the
   * socket controller, never throws (the disconnect handler has nobody to report to).
   */
  async function markInstanceDisconnected(instanceId) {
    try {
      await db.t_instance.update({ id: instanceId }, { last_seen_at: new Date() }, { fields: ['id'] });
    } catch (e) {
      logger.warn(`instance watchdog: unable to record the disconnection of instance ${instanceId}`);
      logger.warn(e);
    }
  }

  /**
   * The emails are claimed in database before leaving, with a conditional update: two
   * runs overlapping (a cron firing while a manual call is still running) read the same
   * state, and only the one whose claim succeeds sends. A claim released when the email
   * fails, so the next run retries.
   */
  async function sendOfflineAlert(instance, user, now) {
    const claimed = await db.t_user.update(
      { id: user.id, instance_offline_alert_sent_at: null },
      { instance_offline_alert_sent_at: now },
      { fields: ['id'] },
    );
    if (claimed.length === 0) {
      return false;
    }
    try {
      await mailService.send(
        { email: user.email, language: user.language },
        'instance_offline',
        buildInstanceOfflineScope({
          instance,
          user,
          lastSeenAt: instance.last_seen_at,
          delayInMinutes: user.delay_in_minutes,
          now,
          language: user.language,
        }),
      );
    } catch (e) {
      await db.t_user.update(
        { id: user.id, instance_offline_alert_sent_at: now },
        { instance_offline_alert_sent_at: null },
        { fields: ['id'] },
      );
      throw e;
    }
    logger.warn(`instance watchdog: offline alert sent to user ${user.id} for instance ${instance.id}`);
    return true;
  }

  async function sendBackOnlineAlert(instance, user, now) {
    const claimed = await db.t_user.update(
      { id: user.id, 'instance_offline_alert_sent_at is not': null },
      { instance_offline_alert_sent_at: null },
      { fields: ['id'] },
    );
    if (claimed.length === 0) {
      return false;
    }
    try {
      await mailService.send(
        { email: user.email, language: user.language },
        'instance_back_online',
        buildInstanceBackOnlineScope({
          instance,
          user,
          lastSeenAt: instance.last_seen_at,
          now,
          language: user.language,
        }),
      );
    } catch (e) {
      await db.t_user.update(
        { id: user.id, instance_offline_alert_sent_at: null },
        { instance_offline_alert_sent_at: user.alert_sent_at },
        { fields: ['id'] },
      );
      throw e;
    }
    logger.info(`instance watchdog: back online email sent to user ${user.id} for instance ${instance.id}`);
    return true;
  }

  /**
   * What the watchdog has to do for one user of the instance, given whether the instance is
   * connected right now. The "offline" email needs the instance to be seen at least once
   * (a brand new instance is not "offline") and unreachable for longer than the delay of
   * the user; it is sent once per outage. The "back online" email closes the outage.
   */
  function decideUserAction(user, connected, lastSeenAt, now) {
    const alertOpen = user.alert_sent_at !== null;
    if (connected) {
      return alertOpen ? 'back_online' : 'ok';
    }
    if (alertOpen) {
      return 'already_alerted';
    }
    if (!user.enabled) {
      // an alert was open when the user disabled the alerts: nothing left to do
      return 'ok';
    }
    if (lastSeenAt === null) {
      return 'never_seen';
    }
    return minutesBetween(lastSeenAt, now) >= user.delay_in_minutes ? 'alert' : 'wait';
  }

  async function processOneUser(instance, user, connected, execute, now) {
    const action = decideUserAction(user, connected, instance.last_seen_at, now);
    const result = { id: user.id, delay_in_minutes: user.delay_in_minutes, action };
    if (!execute) {
      return result;
    }
    try {
      if (action === 'alert' && !(await sendOfflineAlert(instance, user, now))) {
        // claimed by a concurrent run in the meantime
        return { ...result, action: 'already_alerted' };
      }
      if (action === 'back_online' && !(await sendBackOnlineAlert(instance, user, now))) {
        return { ...result, action: 'ok' };
      }
      return result;
    } catch (e) {
      logger.warn(`instance watchdog: failed to email user ${user.id} for instance ${instance.id}`);
      logger.warn(e);
      return { ...result, action: 'error', error: e.message || 'error' };
    }
  }

  /**
   * Check every primary instance of the accounts having access to Gladys Plus against the
   * websocket cluster, email the users whose instance has been unreachable for longer than
   * their delay, and the users whose instance came back after such an email. Meant to be
   * called every few minutes by a cron; the frequency does not matter for the correctness
   * (an instance is only reported offline when it is not connected right now), only for how
   * late after the delay the email leaves. Read-only unless execute is true.
   */
  async function run(body) {
    const { execute } = validateJobBody(body);
    const now = new Date();
    const connectedInstanceIds = await socketModel.getConnectedInstanceIds();
    // Only the users who opted in, plus the ones with an outage still open (to close it
    // even if they opted out in the meantime), are worth carrying.
    const instances = await db.query(
      `
        SELECT i.id, i.name, i.account_id, i.last_seen_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', u.id, 'email', u.email, 'name', u.name, 'language', u.language,
                'enabled', u.instance_offline_alert_enabled,
                'delay_in_minutes', u.instance_offline_alert_delay_in_minutes,
                'alert_sent_at', u.instance_offline_alert_sent_at
              )
              ORDER BY u.created_at, u.id
            ) FILTER (WHERE u.id IS NOT NULL),
            '[]'
          ) AS users
        FROM t_instance i
        JOIN t_account a ON a.id = i.account_id
        LEFT JOIN t_user u ON u.account_id = i.account_id
          AND u.is_deleted = false
          AND u.email_confirmed = true
          AND (u.instance_offline_alert_enabled = true OR u.instance_offline_alert_sent_at IS NOT NULL)
        WHERE i.is_deleted = false
          AND i.primary_instance = true
          AND a.status = ANY($1)
        GROUP BY i.id
        ORDER BY i.last_seen_at ASC NULLS FIRST;
      `,
      [ACTIVE_STATUSES],
    );
    const connectedIds = instances.map((instance) => instance.id).filter((id) => connectedInstanceIds.has(id));
    logger.info(
      `instance watchdog: ${instances.length} instances, ${connectedIds.length} connected (execute=${execute})`,
    );
    if (connectedIds.length === 0 && instances.length >= getFailClosedMinInstances()) {
      logger.error(
        `instance watchdog: none of the ${instances.length} instances is connected, the socket cluster is suspect: aborting`,
      );
      return {
        execute,
        aborted: 'no_instance_connected',
        total: instances.length,
        connected: 0,
        offline: instances.length,
        alerts: 0,
        back_online: 0,
        waiting: 0,
        errors: 0,
        instances: [],
      };
    }
    const results = await Promise.mapSeries(instances, async (instance) => {
      const connected = connectedInstanceIds.has(instance.id);
      const users = await Promise.mapSeries(instance.users, (user) =>
        processOneUser(instance, user, connected, execute, now),
      );
      return {
        id: instance.id,
        name: instance.name,
        account_id: instance.account_id,
        connected,
        last_seen_at: instance.last_seen_at ? new Date(instance.last_seen_at).toISOString() : null,
        offline_for_in_minutes: !connected && instance.last_seen_at ? minutesBetween(instance.last_seen_at, now) : null,
        users,
      };
    });
    // Heartbeat of the connected instances, after the emails so a "back online" email still
    // knows when the outage started. An instance whose "back online" email failed keeps its
    // date: the outage is still open for that user, the retry needs the real start.
    const heartbeatIds = results
      .filter((instance) => instance.connected && !instance.users.some((user) => user.action === 'error'))
      .map((instance) => instance.id);
    if (execute && heartbeatIds.length > 0) {
      await db.query('UPDATE t_instance SET last_seen_at = $1 WHERE id = ANY($2::uuid[])', [now, heartbeatIds]);
    }
    const countUserActions = (action) =>
      results.reduce((count, instance) => count + instance.users.filter((user) => user.action === action).length, 0);
    return {
      execute,
      total: results.length,
      connected: connectedIds.length,
      offline: results.length - connectedIds.length,
      alerts: countUserActions('alert'),
      back_online: countUserActions('back_online'),
      waiting: countUserActions('wait'),
      errors: countUserActions('error'),
      // Only the instances with something to say: offline with a subscribed user, or coming back
      instances: results.filter(
        (instance) =>
          instance.users.length > 0 && (!instance.connected || instance.users.some((u) => u.action !== 'ok')),
      ),
    };
  }

  return {
    markInstanceDisconnected,
    run,
  };
};
