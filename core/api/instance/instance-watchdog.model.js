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
 * household its home is unreachable, precisely because the home itself cannot: power cut,
 * dead SD card, internet box down while on holidays.
 *
 * Two sources feed t_instance.last_seen_at: the websocket disconnect of the instance (exact
 * time it went away) and the job below, which refreshes the instances still connected (so
 * a gateway node crashing, where no disconnect event is emitted, does not leave a stale
 * date behind). The alert is a setting of the account (t_account.instance_offline_alert_*,
 * changed by its admins), the emails go to the admins of the account, and
 * t_account.instance_offline_alert_sent_at tracks the outage reported to them: set when
 * the "offline" email is sent, cleared when the "back online" one is.
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

  // One email per admin, the failures reported per recipient: a bounced address must not
  // deprive the other admins of the alert.
  async function sendToAdmins(instance, template, buildScope) {
    return Promise.mapSeries(instance.admins, async (admin) => {
      try {
        await mailService.send({ email: admin.email, language: admin.language }, template, buildScope(admin));
        return { id: admin.id, status: 'sent' };
      } catch (e) {
        logger.warn(`instance watchdog: failed to email admin ${admin.id} for instance ${instance.id}`);
        logger.warn(e);
        return { id: admin.id, status: 'error', error: e.message || 'error' };
      }
    });
  }

  /**
   * The emails are claimed in database before leaving, with a conditional update of the
   * account: two runs overlapping (a cron firing while a manual call is still running) read
   * the same state, and only the one whose claim succeeds sends. The claim is released when
   * no email left at all, so the next run retries.
   */
  async function sendOfflineAlert(instance, now) {
    const claimed = await db.t_account.update(
      { id: instance.account_id, instance_offline_alert_sent_at: null },
      { instance_offline_alert_sent_at: now },
      { fields: ['id'] },
    );
    if (claimed.length === 0) {
      return { action: 'already_alerted' };
    }
    const recipients = await sendToAdmins(instance, 'instance_offline', (admin) =>
      buildInstanceOfflineScope({
        instance,
        user: admin,
        lastSeenAt: instance.last_seen_at,
        delayInMinutes: instance.delay_in_minutes,
        now,
        language: admin.language,
      }),
    );
    if (!recipients.some((recipient) => recipient.status === 'sent')) {
      await db.t_account.update(
        { id: instance.account_id, instance_offline_alert_sent_at: now },
        { instance_offline_alert_sent_at: null },
        { fields: ['id'] },
      );
      return { action: 'error', recipients };
    }
    logger.warn(`instance watchdog: offline alert sent for instance ${instance.id} (account ${instance.account_id})`);
    return { action: 'alert', recipients };
  }

  async function sendBackOnlineAlert(instance, now) {
    const claimed = await db.t_account.update(
      { id: instance.account_id, 'instance_offline_alert_sent_at is not': null },
      { instance_offline_alert_sent_at: null },
      { fields: ['id'] },
    );
    if (claimed.length === 0) {
      // A concurrent run is closing the outage: it heartbeats the instance itself once its
      // email left, and keeps the real start of the outage for a retry if it did not.
      return { action: 'already_closed' };
    }
    const recipients = await sendToAdmins(instance, 'instance_back_online', (admin) =>
      buildInstanceBackOnlineScope({
        instance,
        user: admin,
        lastSeenAt: instance.last_seen_at,
        now,
        language: admin.language,
      }),
    );
    if (!recipients.some((recipient) => recipient.status === 'sent')) {
      await db.t_account.update(
        { id: instance.account_id, instance_offline_alert_sent_at: null },
        { instance_offline_alert_sent_at: instance.alert_sent_at },
        { fields: ['id'] },
      );
      return { action: 'error', recipients };
    }
    logger.info(
      `instance watchdog: back online email sent for instance ${instance.id} (account ${instance.account_id})`,
    );
    return { action: 'back_online', recipients };
  }

  /**
   * What the watchdog has to do for one instance, given whether it is connected right now.
   * The "offline" email needs the instance to be seen at least once (a brand new instance
   * is not "offline") and unreachable for longer than the delay of the account; it is sent
   * once per outage. The "back online" email closes the outage, even if the alerts were
   * disabled in the meantime.
   */
  function decideAction(instance, connected, now) {
    const alertOpen = instance.alert_sent_at !== null;
    if (connected) {
      return alertOpen ? 'back_online' : 'ok';
    }
    if (alertOpen) {
      return 'already_alerted';
    }
    if (!instance.enabled) {
      return 'ok';
    }
    if (instance.last_seen_at === null) {
      return 'never_seen';
    }
    if (minutesBetween(instance.last_seen_at, now) < instance.delay_in_minutes) {
      return 'wait';
    }
    return instance.admins.length > 0 ? 'alert' : 'no_recipient';
  }

  async function processOneInstance(instance, connected, execute, now) {
    const action = decideAction(instance, connected, now);
    const result = {
      id: instance.id,
      name: instance.name,
      account_id: instance.account_id,
      connected,
      last_seen_at: instance.last_seen_at ? new Date(instance.last_seen_at).toISOString() : null,
      offline_for_in_minutes: !connected && instance.last_seen_at ? minutesBetween(instance.last_seen_at, now) : null,
      enabled: instance.enabled,
      delay_in_minutes: instance.delay_in_minutes,
      action,
      recipients: instance.admins.map((admin) => ({ id: admin.id })),
    };
    if (!execute) {
      return result;
    }
    if (action === 'alert') {
      return { ...result, ...(await sendOfflineAlert(instance, now)) };
    }
    if (action === 'back_online') {
      return { ...result, ...(await sendBackOnlineAlert(instance, now)) };
    }
    return result;
  }

  /**
   * Check every primary instance of the accounts having access to Gladys Plus against the
   * websocket cluster, email the admins of the accounts whose instance has been unreachable
   * for longer than their delay, and the admins whose instance came back after such an
   * email. Meant to be called every few minutes by a cron; the frequency does not matter
   * for the correctness (an instance is only reported offline when it is not connected
   * right now), only for how late after the delay the email leaves. Read-only unless
   * execute is true.
   */
  async function run(body) {
    const { execute } = validateJobBody(body);
    const now = new Date();
    const connectedInstanceIds = await socketModel.getConnectedInstanceIds();
    // The confirmed admins of the account are the recipients
    const instances = await db.query(
      `
        SELECT i.id, i.name, i.account_id, i.last_seen_at,
          a.instance_offline_alert_enabled AS enabled,
          a.instance_offline_alert_delay_in_minutes AS delay_in_minutes,
          a.instance_offline_alert_sent_at AS alert_sent_at,
          COALESCE(
            json_agg(
              json_build_object('id', u.id, 'email', u.email, 'name', u.name, 'language', u.language)
              ORDER BY u.created_at, u.id
            ) FILTER (WHERE u.id IS NOT NULL),
            '[]'
          ) AS admins
        FROM t_instance i
        JOIN t_account a ON a.id = i.account_id
        LEFT JOIN t_user u ON u.account_id = a.id
          AND u.is_deleted = false
          AND u.email_confirmed = true
          AND u.role = 'admin'
        WHERE i.is_deleted = false
          AND i.primary_instance = true
          AND a.status = ANY($1)
        GROUP BY i.id, a.id
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
    const results = await Promise.mapSeries(instances, (instance) =>
      processOneInstance(instance, connectedInstanceIds.has(instance.id), execute, now),
    );
    // Heartbeat of the connected instances, after the emails so a "back online" email still
    // knows when the outage started. An instance whose "back online" email failed, or is
    // being sent by a concurrent run, keeps its date: the outage may still be open, the
    // retry needs the real start.
    const heartbeatIds = results
      .filter((instance) => instance.connected && !['error', 'already_closed'].includes(instance.action))
      .map((instance) => instance.id);
    if (execute && heartbeatIds.length > 0) {
      await db.query('UPDATE t_instance SET last_seen_at = $1 WHERE id = ANY($2::uuid[])', [now, heartbeatIds]);
    }
    const countActions = (action) => results.filter((instance) => instance.action === action).length;
    return {
      execute,
      total: results.length,
      connected: connectedIds.length,
      offline: results.length - connectedIds.length,
      alerts: countActions('alert'),
      back_online: countActions('back_online'),
      waiting: countActions('wait'),
      errors: countActions('error'),
      // Only the instances with something to say: the connected ones with no open outage,
      // and the offline ones nobody asked about, are left out
      instances: results.filter((instance) => instance.action !== 'ok'),
    };
  }

  return {
    markInstanceDisconnected,
    run,
  };
};
