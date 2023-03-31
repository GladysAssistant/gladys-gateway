const Promise = require('bluebird');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const get = require('get-value');
const { homegraph, auth } = require('@googleapis/homegraph');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const { ForbiddenError } = require('../../common/error');

const GOOGLE_OAUTH_CODE_REDIS_PREFIX = `GOOGLE_OAUTH_CODE`;
const GOOGLE_CODE_EXPIRY_IN_SECONDS = 60 * 60;
const JWT_AUDIENCE = 'google-home-oauth';
const SCOPE = ['google-home'];

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
    const userId = await redisClient.get(`${GOOGLE_OAUTH_CODE_REDIS_PREFIX}:${code}`);
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
      id: uuid.v4(),
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

  async function requestSync(instanceId) {
    const users = await db.query(getUsersWithGoogleActivatedQuery, [instanceId, GOOGLE_HOME_OAUTH_CLIENT_ID]);
    if (users.length > 0) {
      await homegraphClient.devices.requestSync({
        requestBody: {
          agentUserId: users[0].account_id,
        },
      });
    }
  }

  async function reportState(instanceId, payload) {
    const users = await db.query(getUsersWithGoogleActivatedQuery, [instanceId, GOOGLE_HOME_OAUTH_CLIENT_ID]);
    if (users.length > 0) {
      const payloadCleaned = cleanNullProperties(payload);
      const requestBody = {
        requestId: uuid.v4(),
        agentUserId: users[0].account_id,
        payload: payloadCleaned,
      };
      try {
        await homegraphClient.devices.reportStateAndNotification({
          requestBody,
        });
      } catch (e) {
        logger.error(`GOOGLE_HOME_REPORT_STATE_ERROR, user = ${users[0].id}`);
        // We only log error only if status is not 404
        if (get(e, 'response.status') !== 404) {
          logger.error(e);
          logger.error(payloadCleaned);
        }
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
