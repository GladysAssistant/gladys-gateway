const uuid = require('uuid');
const axios = require('axios');
const get = require('get-value');
const Bottleneck = require('bottleneck');
const retry = require('async-retry');

const { ForbiddenError } = require('../../common/error');

const ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX = 'enedis-grant-access-token:';

module.exports = function EnedisModel(logger, db, redisClient) {
  const {
    ENEDIS_GRANT_CLIENT_ID,
    ENEDIS_GRANT_CLIENT_SECRET,
    ENEDIS_BACKEND_URL,
    ENEDIS_GLADYS_PLUS_REDIRECT_URI,
    REDIS_HOST,
    REDIS_PORT,
    REDIS_PASSWORD,
  } = process.env;

  const enedisApiLimiter = new Bottleneck({
    // Enedis API is limited at 5 req/sec so we take
    // a little margin and take 5 reqs per 5 * 210 = 1050 ms
    maxConcurrent: 5,
    minTime: 210,
    id: 'gladys-gateway',
    /* Clustering options */
    datastore: 'redis',
    clearDatastore: false,
    clientOptions: {
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      requestsTimeout: 15000,
    },
  });

  async function getRedirectUri() {
    const url = `https://${ENEDIS_BACKEND_URL}/dataconnect/v1/oauth2/authorize`;
    const params = new URLSearchParams({
      client_id: ENEDIS_GRANT_CLIENT_ID,
      response_type: 'code',
      state: uuid.v4(),
      duration: 'P3Y',
    });
    return `${url}?${params.toString()}`;
  }

  async function saveEnedisAccessTokenAndRefreshToken(instanceId, deviceId, data) {
    await redisClient.setAsync(
      `${ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX}:${instanceId}`,
      data.access_token,
      'EX',
      data.expires_in - 60, // We remove 1 minute to be safe
    );

    await db.t_device.update(deviceId, {
      provider_refresh_token: data.refresh_token,
    });
  }

  async function handleAcceptGrantMessage(authorizationCode, user) {
    logger.info(`Enedis.handleAcceptGrantMessage : ${user.id}`);
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', authorizationCode);
    params.append('client_id', ENEDIS_GRANT_CLIENT_ID);
    params.append('client_secret', ENEDIS_GRANT_CLIENT_SECRET);
    params.append('redirect_uri', ENEDIS_GLADYS_PLUS_REDIRECT_URI);
    const options = {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: params,
      url: `https://${ENEDIS_BACKEND_URL}/v1/oauth2/token`,
    };
    const { data } = await axios(options);
    // Create a new device to store the refresh token
    const newDevice = {
      id: uuid.v4(),
      name: 'Enedis',
      client_id: ENEDIS_GRANT_CLIENT_ID,
      user_id: user.id,
      provider_refresh_token: data.refresh_token,
    };
    await db.t_device.insert(newDevice);
    return {
      usage_points_id: data.usage_points_id.split(','),
    };
  }

  async function getAccessToken(instanceId) {
    const accessTokenInRedis = await redisClient.getAsync(`${ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX}:${instanceId}`);
    if (accessTokenInRedis) {
      return accessTokenInRedis;
    }
    const getDevicesWithEnedisActivated = `
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
    const devices = await db.query(getDevicesWithEnedisActivated, [instanceId, ENEDIS_GRANT_CLIENT_ID]);
    if (devices.length === 0) {
      logger.warn(`Forbidden: Enedis Oauth process was not done`);
      throw new ForbiddenError();
    }
    const device = devices[0];
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', device.provider_refresh_token);
    params.append('client_id', ENEDIS_GRANT_CLIENT_ID);
    params.append('client_secret', ENEDIS_GRANT_CLIENT_SECRET);
    const options = {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      query: {
        redirect_uri: ENEDIS_GLADYS_PLUS_REDIRECT_URI,
      },
      data: params,
      url: `https://${ENEDIS_BACKEND_URL}/v1/oauth2/token`,
    };
    try {
      const { data } = await axios(options);
      // save new refresh token
      await saveEnedisAccessTokenAndRefreshToken(instanceId, device.id, data);
      return data.access_token;
    } catch (e) {
      // if status is 400, token is invalid, revoke token
      if (get(e, 'response.status') === 400) {
        logger.warn(e);
        await db.t_device.update(device.id, {
          revoked: true,
        });
      }

      throw e;
    }
  }

  async function makeRequest(url, query, accessToken) {
    const options = {
      method: 'GET',
      query,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      url: `https://${ENEDIS_BACKEND_URL}${url}`,
    };
    const { data } = await axios(options);
    return data;
  }

  const makeRequestWithQueue = enedisApiLimiter.wrap(makeRequest);

  const makeRequestWithQueueAndRetry = (url, query, accessToken) => {
    // we retry failed (5xx)requests with an exponential backoff
    const options = {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
    };
    return retry(async (bail) => {
      try {
        const res = await makeRequestWithQueue(url, query, accessToken);
        return res;
      } catch (e) {
        logger.warn(e);
        // we only retry 5xx error
        if (get(e, 'response.status') < 500) {
          bail(e);
          return null;
        }
        throw e;
      }
    }, options);
  };

  return {
    makeRequest,
    makeRequestWithQueueAndRetry,
    getAccessToken,
    handleAcceptGrantMessage,
    getRedirectUri,
  };
};
