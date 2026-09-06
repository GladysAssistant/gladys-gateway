/**
 * Admin API: management of Gladys Plus accounts, users, Enedis syncs and Gladys versions.
 * Every route is protected by the adminAuth middleware (see core/middleware/adminAuth.js),
 * every successful mutation is logged with who did it (audit trail, ids only, never emails).
 * Refused or failed calls are logged by the error middleware, not as audit lines.
 */
module.exports = function AdminApiController(logger, adminAccountModel, adminVersionModel, adminModel) {
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
    deleteAccount,
    resetTwoFactor,
    deleteUser,
    getEnedisState,
    refreshEnedisData,
    listVersions,
    createVersion,
    updateVersion,
  };
};
