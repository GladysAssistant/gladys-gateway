/**
 * Admin API: management of Gladys Plus accounts, users, Enedis syncs and Gladys versions.
 * Every route is protected by the adminAuth middleware (see core/middleware/adminAuth.js),
 * every successful mutation is logged with who did it (audit trail, ids only, never emails).
 * Refused or failed calls are logged by the error middleware, not as audit lines.
 */
module.exports = function AdminApiController(
  logger,
  adminAccountModel,
  adminVersionModel,
  adminModel,
  adminAccountLifecycleModel,
  instanceWatchdogModel,
) {
  function describeCaller(req) {
    const { admin } = req;
    const who = admin.auth_mode === 'api_key' ? `api key ${admin.api_key_name}` : `super admin ${admin.user_id}`;
    return `${who} from ${req.ip}`;
  }

  function audit(req, action) {
    logger.warn(`Admin API audit: ${action} by ${describeCaller(req)}`);
  }

  /**
   * @api {get} /admin/api/accounts List accounts
   * @apiName adminListAccounts
   * @apiGroup Admin API
   * @apiHeader {String} [X-Admin-Api-Key] Admin API key (machine access)
   * @apiHeader {String} [Authorization] Super admin access token (Bearer JWT)
   *
   * @apiParam {String} [search] Account email, user email (partial, case insensitive) or exact account/user id
   * @apiParam {Number} [limit=50] Page size (max 200)
   * @apiParam {Number} [offset=0]
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "total": 1,
   *   "limit": 50,
   *   "offset": 0,
   *   "accounts": [
   *     {
   *       "id": "071217d1-9c67-440a-acaa-185578c480ca",
   *       "name": "tony.stark@gladysassistant.com",
   *       "plan": "plus",
   *       "status": "active",
   *       "current_period_end": "2050-11-19T16:00:00.000Z",
   *       "created_at": "2018-10-16T02:21:25.901Z",
   *       "updated_at": "2018-10-16T02:21:25.901Z",
   *       "user_count": 1
   *     }
   *   ]
   * }
   */
  async function listAccounts(req, res) {
    const result = await adminAccountModel.listAccounts(req.query);
    res.json(result);
  }

  /**
   * @api {get} /admin/api/accounts/:id Get account
   * @apiName adminGetAccount
   * @apiGroup Admin API
   * @apiDescription Account, users (with their active devices), instances, last 5 backups,
   * Enedis usage points and a summary of the Stripe subscription (null when the account has
   * no subscription or Stripe is unreachable).
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "account": { "id": "...", "name": "...", "plan": "plus", "status": "active", ... },
   *   "users": [{ "id": "...", "email": "...", "two_factor_enabled": true,
   *              "devices": { "active_count": 2, "last_seen": "..." } }],
   *   "instances": [{ "id": "...", "name": "Raspberry Pi 1", "primary_instance": true }],
   *   "backups": [{ "id": "...", "size": 1000, "status": "successed", "created_at": "..." }],
   *   "enedis_usage_points": [{ "usage_point_id": "1111111111", "created_at": "..." }],
   *   "stripe": { "subscription_id": "sub_...", "status": "active", "cancel_at_period_end": false,
   *               "current_period_end": "..." }
   * }
   */
  async function getAccount(req, res) {
    const account = await adminAccountModel.getAccount(req.params.id);
    res.json(account);
  }

  /**
   * @api {delete} /admin/api/accounts/:id Delete account
   * @apiName adminDeleteAccount
   * @apiGroup Admin API
   * @apiDescription Delete an account and everything attached to it (users, devices,
   * instances, backups on the storage, Enedis data). Refused (403) when the Stripe
   * subscription is still active.
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  async function deleteAccount(req, res) {
    await adminModel.deleteAccount(req.params.id);
    audit(req, `delete account ${req.params.id}`);
    res.json({ status: 200 });
  }

  /**
   * @api {patch} /admin/api/accounts/:id Update account flags
   * @apiName adminUpdateAccount
   * @apiGroup Admin API
   * @apiDescription Flag an account as internal (team, tests, demos). Internal accounts are
   * not customers: they are excluded from the paying users stats and never touched by the
   * retention policy. Other fields are ignored.
   *
   * @apiParam {Boolean} is_internal
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "id": "b2d23f66-487d-493f-8acb-9c8adb400def",
   *   "name": "tony.stark@gladysassistant.com",
   *   "plan": "plus",
   *   "status": "active",
   *   "is_internal": true,
   *   ...
   * }
   */
  async function updateAccount(req, res) {
    const account = await adminAccountModel.updateAccount(req.params.id, req.body);
    audit(req, `update account ${req.params.id} (is_internal=${account.is_internal})`);
    res.json(account);
  }

  /**
   * @api {post} /admin/api/accounts/sync-stripe Reconcile accounts with Stripe
   * @apiName adminSyncAccountsWithStripe
   * @apiGroup Admin API
   * @apiDescription For every account having a Stripe subscription, fetch the subscription
   * on Stripe side and compare status, plan and end of access with the database. Repairs
   * the accounts left behind by a missed webhook (an account stuck in "past_due" whose
   * subscription Stripe has since canceled for example). Read-only unless "execute" is true.
   * Only the accounts that differ or could not be checked are listed.
   *
   * @apiParam {Boolean} [execute=false] Write the Stripe values in database
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "execute": false,
   *   "total": 226,
   *   "checked": 225,
   *   "changed": 95,
   *   "errors": 1,
   *   "accounts": [
   *     {
   *       "id": "be2b9666-5c72-451e-98f4-efca76ffef54",
   *       "name": "tony.stark@gladysassistant.com",
   *       "before": { "status": "past_due", "plan": "plus", "current_period_end": "2025-06-02T08:10:00.000Z" },
   *       "after": { "status": "canceled", "plan": "plus", "current_period_end": "2025-06-02T08:10:00.000Z" },
   *       "changed": true
   *     },
   *     {
   *       "id": "...", "name": "...", "before": { ... }, "after": { ... }, "changed": false,
   *       "error": "resource_missing"
   *     }
   *   ]
   * }
   */
  async function syncAccountsWithStripe(req, res) {
    const report = await adminAccountLifecycleModel.syncWithStripe(req.body);
    audit(req, `sync accounts with Stripe (execute=${report.execute}, changed=${report.changed})`);
    res.json(report);
  }

  /**
   * @api {post} /admin/api/accounts/retention Apply the retention policy
   * @apiName adminApplyRetentionPolicy
   * @apiGroup Admin API
   * @apiDescription Retention of the accounts whose subscription is over (canceled, unpaid,
   * never converted...). Once the grace period (ACCOUNT_RETENTION_GRACE_PERIOD_IN_DAYS,
   * 180 by default) has elapsed since the end of access, the users of the account receive
   * an email announcing the deletion ("warn"). Once the warning period
   * (ACCOUNT_RETENTION_WARNING_PERIOD_IN_DAYS, 30 by default) has elapsed too, the account is
   * deleted with its backups, users, instances and Enedis data ("delete"). Accounts warned
   * less than the warning period ago are reported as "wait". Internal accounts and accounts
   * whose access has not ended are never candidates. Read-only unless "execute" is true:
   * call it first without "execute" to review the list, flag the internal accounts, then
   * call it with "execute" (daily from a cron for example).
   *
   * @apiParam {Boolean} [execute=false] Send the emails and delete the accounts
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "execute": true,
   *   "grace_period_in_days": 180,
   *   "warning_period_in_days": 30,
   *   "total": 3,
   *   "warned": 1,
   *   "waiting": 1,
   *   "deleted": 1,
   *   "errors": 0,
   *   "accounts": [
   *     {
   *       "id": "...", "name": "...", "status": "canceled",
   *       "access_ended_at": "2025-01-10T08:10:00.000Z",
   *       "deletion_warning_sent_at": null,
   *       "action": "warn",
   *       "deletion_date": "2026-10-07T08:10:00.000Z"
   *     },
   *     { "id": "...", "action": "wait", "deletion_date": "2026-09-20T08:10:00.000Z", ... },
   *     { "id": "...", "action": "delete", ... },
   *     { "id": "...", "action": "error", "error": "Cannot delete an active customer", ... }
   *   ]
   * }
   */
  async function applyRetentionPolicy(req, res) {
    const report = await adminAccountLifecycleModel.applyRetentionPolicy(req.body);
    audit(
      req,
      `apply retention policy (execute=${report.execute}, warned=${report.warned}, deleted=${report.deleted})`,
    );
    res.json(report);
  }

  /**
   * @api {post} /admin/api/instances/watchdog Run the instance watchdog
   * @apiName adminRunInstanceWatchdog
   * @apiGroup Admin API
   * @apiDescription "Is my Gladys alive?": check every primary instance of the accounts
   * having access to Gladys Plus against the websocket cluster. The users who opted in
   * (instance_offline_alert_enabled on PATCH /users/me) whose instance has been unreachable
   * for longer than their delay (instance_offline_alert_delay_in_minutes) receive the
   * "instance offline" email ("alert"), once per outage; once the instance is connected
   * again they receive the "back online" email ("back_online"). Also refreshes
   * last_seen_at of the connected instances. Meant to be called every few minutes by a
   * cron: the frequency only decides how late after the delay the email leaves, an instance
   * is never reported offline while it is connected. Read-only unless "execute" is true.
   * Only the instances with something to report are listed.
   *
   * @apiParam {Boolean} [execute=false] Send the emails and refresh last_seen_at
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "execute": true,
   *   "total": 180,
   *   "connected": 176,
   *   "offline": 4,
   *   "alerts": 1,
   *   "back_online": 0,
   *   "waiting": 1,
   *   "errors": 0,
   *   "instances": [
   *     {
   *       "id": "0bc53f3c-1e11-40d3-99a4-bd392a666eaf",
   *       "name": "Raspberry Pi",
   *       "account_id": "b2d23f66-487d-493f-8acb-9c8adb400def",
   *       "connected": false,
   *       "last_seen_at": "2026-09-07T12:00:00.000Z",
   *       "offline_for_in_minutes": 95,
   *       "users": [
   *         { "id": "a139e4a6-ec6c-442d-9730-0499155d38d4", "delay_in_minutes": 60, "action": "alert" },
   *         { "id": "bdb1a902-a65e-46f9-8c2a-5c09840e2e10", "delay_in_minutes": 120, "action": "wait" }
   *       ]
   *     }
   *   ]
   * }
   */
  async function runInstanceWatchdog(req, res) {
    const report = await instanceWatchdogModel.run(req.body);
    if (report.execute) {
      audit(
        req,
        `run instance watchdog (offline=${report.offline}, alerts=${report.alerts}, back_online=${report.back_online})`,
      );
    }
    res.json(report);
  }

  /**
   * @api {post} /admin/api/users/:id/reset_two_factor Reset two factor
   * @apiName adminResetTwoFactor
   * @apiGroup Admin API
   * @apiDescription Disable the second factor of a user who lost his authenticator. The TOTP
   * secret and the recovery codes are erased, existing sessions are kept.
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "id": "a139e4a6-ec6c-442d-9730-0499155d38d4",
   *   "email": "tony.stark@gladysassistant.com",
   *   "two_factor_enabled": false,
   *   ...
   * }
   */
  async function resetTwoFactor(req, res) {
    const user = await adminAccountModel.resetTwoFactor(req.params.id);
    audit(req, `reset two factor of user ${user.id}`);
    res.json(user);
  }

  /**
   * @api {delete} /admin/api/users/:id Delete user
   * @apiName adminDeleteUser
   * @apiGroup Admin API
   * @apiDescription Delete one user of an account (devices, history, Open API keys, reset
   * password tokens). Refused (403) for the last user of an account: delete the account instead.
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  async function deleteUser(req, res) {
    await adminAccountModel.deleteUser(req.params.id);
    audit(req, `delete user ${req.params.id}`);
    res.json({ status: 200 });
  }

  /**
   * @api {get} /admin/api/accounts/:id/enedis Get Enedis sync state
   * @apiName adminGetEnedisState
   * @apiGroup Admin API
   * @apiDescription For each usage point of the account: the 10 last syncs, the number of
   * daily consumption / load curve rows stored and the date of the most recent one.
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "usage_points": [
   *     {
   *       "usage_point_id": "1111111111",
   *       "created_at": "2023-12-29T05:29:50.908Z",
   *       "syncs": [{ "id": "...", "jobs_done": 2, "jobs_total": 2, "created_at": "...", "updated_at": "..." }],
   *       "daily_consumption": { "count": 365, "last_date": "2025-02-06" },
   *       "consumption_load_curve": { "count": 17520, "last_date": "2025-02-06T22:30:00.000Z" }
   *     }
   *   ]
   * }
   */
  async function getEnedisState(req, res) {
    const state = await adminAccountModel.getEnedisState(req.params.id);
    res.json(state);
  }

  /**
   * @api {post} /admin/api/accounts/:id/enedis/refresh Refresh Enedis data
   * @apiName adminRefreshEnedisData
   * @apiGroup Admin API
   * @apiDescription Queue a full refresh of the Enedis data of the account.
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "success": true
   * }
   */
  async function refreshEnedisData(req, res) {
    await adminAccountModel.refreshEnedisData(req.params.id);
    audit(req, `refresh Enedis data of account ${req.params.id}`);
    res.json({ success: true });
  }

  /**
   * @api {get} /admin/api/gladys/versions List Gladys versions
   * @apiName adminListGladysVersions
   * @apiGroup Admin API
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * [
   *   {
   *     "id": "27672c3b-220b-4813-9488-2a9b0e8b8542",
   *     "name": "v4.57.0",
   *     "active": true,
   *     "default_release_note_link": "https://github.com/GladysAssistant/Gladys/releases/tag/v4.57.0",
   *     "fr_release_note_link": "https://github.com/GladysAssistant/Gladys/releases/tag/v4.57.0",
   *     "created_at": "2018-10-16T02:21:25.901Z",
   *     "updated_at": "2018-10-16T02:21:25.901Z"
   *   }
   * ]
   */
  async function listVersions(req, res) {
    const versions = await adminVersionModel.listVersions();
    res.json(versions);
  }

  /**
   * @api {post} /admin/api/gladys/versions Create Gladys version
   * @apiName adminCreateGladysVersion
   * @apiGroup Admin API
   * @apiDescription Publish a new Gladys version: the most recent active version is the one
   * returned to Gladys instances. Also accepts the GLADYS_VERSION_API_KEY key (release CI).
   * 409 when the version already exists, 422 when the body is invalid.
   *
   * @apiParam {String} name Version name, ex: "v4.57.0"
   * @apiParam {String} [default_release_note_link] https link
   * @apiParam {String} [fr_release_note_link] https link
   * @apiParam {Boolean} [active=true]
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 201 Created
   *
   * {
   *   "id": "27672c3b-220b-4813-9488-2a9b0e8b8542",
   *   "name": "v4.57.0",
   *   "active": true,
   *   "default_release_note_link": "https://github.com/GladysAssistant/Gladys/releases/tag/v4.57.0",
   *   "fr_release_note_link": "https://github.com/GladysAssistant/Gladys/releases/tag/v4.57.0",
   *   "created_at": "2018-10-16T02:21:25.901Z",
   *   "updated_at": "2018-10-16T02:21:25.901Z"
   * }
   */
  async function createVersion(req, res) {
    const version = await adminVersionModel.createVersion(req.body);
    audit(req, `create Gladys version ${version.name} (${version.id})`);
    res.status(201).json(version);
  }

  /**
   * @api {patch} /admin/api/gladys/versions/:id Update Gladys version
   * @apiName adminUpdateGladysVersion
   * @apiGroup Admin API
   * @apiDescription Change the release note links or deactivate a version (rollback).
   *
   * @apiParam {String} [default_release_note_link] https link
   * @apiParam {String} [fr_release_note_link] https link
   * @apiParam {Boolean} [active]
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "id": "27672c3b-220b-4813-9488-2a9b0e8b8542",
   *   "name": "v4.57.0",
   *   "active": false,
   *   ...
   * }
   */
  async function updateVersion(req, res) {
    const version = await adminVersionModel.updateVersion(req.params.id, req.body);
    audit(req, `update Gladys version ${version.name} (${version.id})`);
    res.json(version);
  }

  return {
    listAccounts,
    getAccount,
    updateAccount,
    deleteAccount,
    syncAccountsWithStripe,
    applyRetentionPolicy,
    runInstanceWatchdog,
    resetTwoFactor,
    deleteUser,
    getEnedisState,
    refreshEnedisData,
    listVersions,
    createVersion,
    updateVersion,
  };
};
