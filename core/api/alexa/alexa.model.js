const Promise = require('bluebird');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const get = require('get-value');
const randomBytes = Promise.promisify(require('crypto').randomBytes);

const axios = require('../../service/axios');
const { ForbiddenError } = require('../../common/error');

const ALEXA_OAUTH_CODE_REDIS_PREFIX = `ALEXA_OAUTH_CODE`;
const ALEXA_CODE_EXPIRY_IN_SECONDS = 60 * 60;

const ALEXA_GRANT_ACCESS_TOKEN_REDIS_PREFIX = 'alexa-grant-access-token';

const ALEXA_USERS_REDIS_PREFIX = 'alexa-users';

const JWT_AUDIENCE = 'alexa-oauth';
const SCOPE = ['alexa'];

module.exports = function AlexaModel(logger, db, redisClient, jwtService) {
  const { ALEXA_OAUTH_CLIENT_ID } = process.env;

  async function getRefreshTokenAndAccessToken(code) {
    const userId = await redisClient.get(`${ALEXA_OAUTH_CODE_REDIS_PREFIX}:${code}`);
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
      name: 'Alexa',
      client_id: ALEXA_OAUTH_CLIENT_ID,
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
    await redisClient.set(`${ALEXA_OAUTH_CODE_REDIS_PREFIX}:${code}`, userId, {
      EX: ALEXA_CODE_EXPIRY_IN_SECONDS,
    });
    return code;
  }

  const getUsersWithAlexaActivatedQuery = `
      SELECT DISTINCT t_user.id, t_user.account_id, 
      t_device.id as device_id, t_device.provider_refresh_token
      FROM t_user
      INNER JOIN t_device ON t_user.id = t_device.user_id
      INNER JOIN t_instance ON t_user.account_id = t_instance.account_id
      WHERE t_instance.id = $1
      AND t_device.revoked = false
      AND t_device.is_deleted = false
      AND t_device.client_id = $2;
    `;

  async function saveAlexaAccessTokenAndRefreshToken(deviceId, data) {
    await redisClient.set(`${ALEXA_GRANT_ACCESS_TOKEN_REDIS_PREFIX}:${deviceId}`, data.access_token, {
      EX: data.expires_in - 60, // We remove 1 minute to be safe
    });

    await db.t_device.update(deviceId, {
      provider_refresh_token: data.refresh_token,
    });
  }

  async function handleAcceptGrantMessage(authorizationCode, deviceId) {
    logger.info(`Alexa.handleAcceptGrantMessage : ${deviceId}`);
    const { ALEXA_GRANT_CLIENT_ID, ALEXA_GRANT_CLIENT_SECRET } = process.env;
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', authorizationCode);
    params.append('client_id', ALEXA_GRANT_CLIENT_ID);
    params.append('client_secret', ALEXA_GRANT_CLIENT_SECRET);
    const options = {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: params,
      url: 'https://api.amazon.com/auth/o2/token',
    };
    const { data } = await axios(options);

    await saveAlexaAccessTokenAndRefreshToken(deviceId, data);

    return {
      event: {
        header: {
          namespace: 'Alexa.Authorization',
          name: 'AcceptGrant.Response',
          messageId: uuid.v4(),
          payloadVersion: '3',
        },
        payload: {},
      },
    };
  }

  async function getAlexaAccessToken(deviceId, refreshToken) {
    const accessTokenInRedis = await redisClient.get(`${ALEXA_GRANT_ACCESS_TOKEN_REDIS_PREFIX}:${deviceId}`);
    if (accessTokenInRedis) {
      return accessTokenInRedis;
    }
    const { ALEXA_GRANT_CLIENT_ID, ALEXA_GRANT_CLIENT_SECRET } = process.env;
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', ALEXA_GRANT_CLIENT_ID);
    params.append('client_secret', ALEXA_GRANT_CLIENT_SECRET);
    const options = {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: params,
      url: 'https://api.amazon.com/auth/o2/token',
    };
    try {
      const { data } = await axios(options);
      await saveAlexaAccessTokenAndRefreshToken(deviceId, data);
      return data.access_token;
    } catch (e) {
      // if status is 400, token is invalid, revoke token
      if (get(e, 'response.status') === 400) {
        await db.t_device.update(deviceId, {
          revoked: true,
        });
      }

      throw e;
    }
  }

  async function getUsersWithAlexaActivated(instanceId) {
    const usersFromCache = await redisClient.get(`${ALEXA_USERS_REDIS_PREFIX}:${instanceId}`);
    if (usersFromCache) {
      logger.debug(`getUsersWithAlexaActivated: Returning Alexa users from Redis cache (instance = ${instanceId})`);
      return JSON.parse(usersFromCache);
    }
    const users = await db.query(getUsersWithAlexaActivatedQuery, [instanceId, ALEXA_OAUTH_CLIENT_ID]);
    await redisClient.set(`${ALEXA_USERS_REDIS_PREFIX}:${instanceId}`, JSON.stringify(users), {
      EX: 1 * 60, // 1 minute
    });
    return users;
  }

  async function reportState(instanceId, payload) {
    const users = await getUsersWithAlexaActivated(instanceId);
    if (users.length > 0) {
      await Promise.each(users, async (user) => {
        try {
          const accessToken = await getAlexaAccessToken(user.device_id, user.provider_refresh_token);
          const options = {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
            data: payload,
            url: 'https://api.eu.amazonalexa.com/v3/events',
          };
          await axios(options);
          // report state
        } catch (e) {
          logger.error(`ALEXA_REPORT_STATE_ERROR, user_id = ${users[0].id}`);
        }
      });
    }
  }

  return {
    getRefreshTokenAndAccessToken,
    getAccessToken,
    getCode,
    reportState,
    handleAcceptGrantMessage,
  };
};
