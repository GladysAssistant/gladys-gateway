const Promise = require('bluebird');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const get = require('get-value');
const retry = require('async-retry');
const { homegraph, auth } = require('@googleapis/homegraph');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const { ForbiddenError } = require('../../common/error');

const GOOGLE_OAUTH_CODE_REDIS_PREFIX = `GOOGLE_OAUTH_CODE`;
const GOOGLE_USERS_REDIS_PREFIX = 'google-users';
const GOOGLE_REQUEST_SYNC_LOCK_REDIS_PREFIX = 'google-request-sync-lock';
const GOOGLE_REQUEST_SYNC_LOCK_EXPIRY_IN_SECONDS = 60 * 60; // 1 hour
const GOOGLE_CODE_EXPIRY_IN_SECONDS = 60 * 60;
const JWT_AUDIENCE = 'google-home-oauth';
const SCOPE = ['google-home'];
// HomeGraph regularly answers a report state with a transient error (503 "The service is
// currently unavailable", 500, 429...). The instance never resends a state, so a lost report
// leaves Google with a stale device: retry with an exponential backoff (500ms, then 1s)
// before giving up. Kept short because the instance is waiting for our HTTP answer.
const GOOGLE_REPORT_STATE_RETRY_CONFIG = {
  retries: 2,
  minTimeout: 500,
  factor: 2,
  randomize: false,
};

const getGoogleErrorMessage = (e) => {
  const message = get(e, 'response.data.error.message') || e.message;
  return typeof message === 'string' ? message : JSON.stringify(message);
};

// only server-side / rate-limit errors are worth retrying: a 4xx (404 device not found,
// 400 invalid payload, 403...) will fail the same way on the next attempt
const isTransientGoogleError = (e) => {
  const status = get(e, 'response.status');
  return status === 429 || (status >= 500 && status <= 599);
};

// device ids come from the instance payload: strip control characters (CR, LF...)
// so they cannot forge extra log lines
// eslint-disable-next-line no-control-regex
const sanitizeForLog = (str) => str.replace(/[\x00-\x1f\x7f]/g, ' ');

const cleanNullProperties = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => [k, v && typeof v === 'object' ? cleanNullProperties(v) : v])
    // eslint-disable-next-line
    .reduce((a, [k, v]) => (v == null ? a : ((a[k] = v), a)), {});

module.exports = function GoogleHomeModel(logger, db, redisClient, jwtService) {
  const { GOOGLE_HOME_OAUTH_CLIENT_ID, GOOGLE_HOME_ACCOUNT_CLIENT_EMAIL, GOOGLE_HOME_ACCOUNT_PRIVATE_KEY } =
    process.env;

  const homegraphClient = homegraph({
    version: 'v1',
    auth: new auth.GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/homegraph',
      credentials: {
        // `client_email` property from the service account Key file downloaded as JSON
        client_email: GOOGLE_HOME_ACCOUNT_CLIENT_EMAIL,
        // `private_key` property from the service account Key file downloaded as JSON
        private_key: GOOGLE_HOME_ACCOUNT_PRIVATE_KEY,
      },
    }),
  });

  async function getRefreshTokenAndAccessToken(code) {
    if (typeof code !== 'string' || code.length === 0) {
      throw new ForbiddenError('INVALID_CODE');
    }
    const codeKey = `${GOOGLE_OAUTH_CODE_REDIS_PREFIX}:${code}`;
    // an authorization code is single use: GETDEL reads and removes it atomically,
    // so two concurrent exchanges cannot both succeed
    const userId = await redisClient.getDel(codeKey);
    if (userId === null) {
      throw new ForbiddenError('INVALID_CODE');
    }
    const user = await db.t_user.findOne(
      {
        id: userId,
      },
      {
        fields: ['id', 'gladys_4_user_id'],
      },
    );

    const newDevice = {
      id: crypto.randomUUID(),
      name: 'Google Home',
      client_id: GOOGLE_HOME_OAUTH_CLIENT_ID,
      user_id: user.id,
    };

    const refreshToken = jwtService.generateRefreshTokenOauth(user, SCOPE, newDevice.id, JWT_AUDIENCE);
    const accessToken = jwtService.generateAccessTokenOauth(user, newDevice, SCOPE, JWT_AUDIENCE);
    newDevice.refresh_token_hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await db.t_device.insert(newDevice);

    return {
      accessToken,
      refreshToken,
    };
  }

  async function getAccessToken(refreshToken) {
    let userId;
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_TOKEN_SECRET, {
        algorithms: ['HS256'],
        audience: JWT_AUDIENCE,
        issuer: 'gladys-gateway',
      });
      userId = decoded.user_id;
    } catch (e) {
      logger.debug(e);
      throw new ForbiddenError();
    }

    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // we are looking for devices not revoked with
    // this refresh_token_hash
    const device = await db.t_device.findOne({
      user_id: userId,
      refresh_token_hash: refreshTokenHash,
      revoked: false,
      is_deleted: false,
    });

    // the device doesn't exist or has been revoked
    if (device === null) {
      logger.debug(`Forbidden: Refresh token not found in DB`);
      throw new ForbiddenError();
    }

    // we get the current user account, to be sure the account is active
    const fullUser = await db.t_user.findOne({
      id: userId,
      is_deleted: false,
    });

    // the user doesn't exist or has been revoked
    if (fullUser === null) {
      logger.debug(`Forbidden: User not found or revoked`);
      throw new ForbiddenError();
    }

    const accessToken = jwtService.generateAccessTokenOauth(fullUser, device, SCOPE, JWT_AUDIENCE);

    return {
      accessToken,
    };
  }

  async function getCode(userId) {
    // we generate a random code
    const code = (await randomBytes(64)).toString('hex');
    // we save the code in Redis
    await redisClient.set(`${GOOGLE_OAUTH_CODE_REDIS_PREFIX}:${code}`, userId, {
      EX: GOOGLE_CODE_EXPIRY_IN_SECONDS,
    });
    return code;
  }

  const getUsersWithGoogleActivatedQuery = `
      SELECT DISTINCT t_user.id, t_user.account_id
      FROM t_user
      INNER JOIN t_device ON t_user.id = t_device.user_id
      INNER JOIN t_instance ON t_user.account_id = t_instance.account_id
      WHERE t_instance.id = $1
      AND t_device.revoked = false
      AND t_device.is_deleted = false
      AND t_device.client_id = $2;
    `;

  // async: when true, Google queues the sync and answers immediately. It allows concurrent
  // Request Sync for the same agentUserId (a synchronous one returns 429 in that case).
  async function sendRequestSync(agentUserId, { async = false } = {}) {
    await homegraphClient.devices.requestSync({
      requestBody: {
        agentUserId,
        ...(async ? { async: true } : {}),
      },
    });
  }

  async function requestSync(instanceId) {
    const users = await db.query(getUsersWithGoogleActivatedQuery, [instanceId, GOOGLE_HOME_OAUTH_CLIENT_ID]);
    if (users.length > 0) {
      await sendRequestSync(users[0].account_id);
    }
  }

  // Google answers 404 to a report state when the device no longer exists in the user's
  // HomeGraph (removed or renamed on Google side). The instance keeps reporting it forever,
  // so we ask Google to re-sync the device list, at most once per hour per account.
  // The lock is taken with SET NX EX so concurrent 404s only trigger a single sync.
  async function requestSyncAfterDeviceNotFound(agentUserId, userId, deviceIds) {
    const lockKey = `${GOOGLE_REQUEST_SYNC_LOCK_REDIS_PREFIX}:${agentUserId}`;
    let lockAcquired;
    try {
      lockAcquired = await redisClient.set(lockKey, '1', {
        NX: true,
        EX: GOOGLE_REQUEST_SYNC_LOCK_EXPIRY_IN_SECONDS,
      });
    } catch (e) {
      // Redis unavailable: don't turn a handled 404 into a failed report state,
      // and don't sync without the lock (it would spam Google)
      logger.warn(`GOOGLE_HOME_REQUEST_SYNC_LOCK_ERROR user=${userId} message=${e.message}`);
      return;
    }
    if (lockAcquired === null) {
      logger.debug(
        `GOOGLE_HOME_REPORT_STATE_DEVICE_NOT_FOUND user=${userId} devices=${deviceIds} (sync already requested recently)`,
      );
      return;
    }
    logger.info(`GOOGLE_HOME_REPORT_STATE_DEVICE_NOT_FOUND user=${userId} devices=${deviceIds}, requesting sync`);
    try {
      // async so this recovery sync neither collides with an instance-initiated
      // Request Sync (429) nor makes the report state wait for a full SYNC round-trip
      await sendRequestSync(agentUserId, { async: true });
    } catch (e) {
      const status = get(e, 'response.status');
      const message = getGoogleErrorMessage(e);
      logger.warn(`GOOGLE_HOME_REQUEST_SYNC_ERROR user=${userId} status=${status} message=${message}`);
    }
  }

  async function getGoogleUsers(instanceId) {
    const usersFromCache = await redisClient.get(`${GOOGLE_USERS_REDIS_PREFIX}:${instanceId}`);
    if (usersFromCache) {
      logger.debug(`getGoogleUsers: Returning Google users from Redis cache (instance = ${instanceId})`);
      return JSON.parse(usersFromCache);
    }
    const users = await db.query(getUsersWithGoogleActivatedQuery, [instanceId, GOOGLE_HOME_OAUTH_CLIENT_ID]);
    await redisClient.set(`${GOOGLE_USERS_REDIS_PREFIX}:${instanceId}`, JSON.stringify(users), {
      EX: 1 * 60, // 1 minute
    });
    return users;
  }

  async function reportState(instanceId, payload) {
    const users = await getGoogleUsers(instanceId);
    if (users.length > 0) {
      const payloadCleaned = cleanNullProperties(payload);
      const requestBody = {
        requestId: crypto.randomUUID(),
        agentUserId: users[0].account_id,
        payload: payloadCleaned,
      };
      const deviceIds = sanitizeForLog(Object.keys(get(payloadCleaned, 'devices.states') || {}).join(',')) || '—';
      try {
        await retry(
          async (bail) => {
            try {
              await homegraphClient.devices.reportStateAndNotification({
                requestBody,
              });
            } catch (e) {
              if (!isTransientGoogleError(e)) {
                bail(e);
                return;
              }
              throw e;
            }
          },
          {
            ...GOOGLE_REPORT_STATE_RETRY_CONFIG,
            onRetry: (e, attempt) => {
              logger.debug(
                `GOOGLE_HOME_REPORT_STATE_RETRY user=${users[0].id} status=${get(
                  e,
                  'response.status',
                )} attempt=${attempt} devices=${deviceIds}`,
              );
            },
          },
        );
      } catch (e) {
        const status = get(e, 'response.status');
        const message = getGoogleErrorMessage(e);
        if (status === 404) {
          await requestSyncAfterDeviceNotFound(users[0].account_id, users[0].id, deviceIds);
          return;
        }
        const retried = isTransientGoogleError(e) ? ` (after ${GOOGLE_REPORT_STATE_RETRY_CONFIG.retries} retries)` : '';
        logger.warn(
          `GOOGLE_HOME_REPORT_STATE_ERROR user=${users[0].id} status=${status} message=${message} devices=${deviceIds}${retried}`,
        );
      }
    }
  }

  return {
    getRefreshTokenAndAccessToken,
    getAccessToken,
    getCode,
    requestSync,
    reportState,
  };
};
