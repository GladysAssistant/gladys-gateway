const axios = require('axios');
const get = require('get-value');
const Promise = require('bluebird');

const { ForbiddenError } = require('../common/error');

const ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX = 'enedis-grant-access-token:';

module.exports = function EnedisModel(logger, db, redisClient) {
  const { ENEDIS_GRANT_CLIENT_ID, ENEDIS_GRANT_CLIENT_SECRET, ENEDIS_BACKEND_URL, ENEDIS_GLADYS_PLUS_REDIRECT_URI } =
    process.env;

  async function saveEnedisAccessTokenAndRefreshToken(instanceId, deviceId, data) {
    await redisClient.set(
      `${ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX}:${instanceId}`,
      data.access_token,
      'EX',
      data.expires_in - 60, // We remove 1 minute to be safe
    );

    await db.t_device.update(deviceId, {
      provider_refresh_token: data.refresh_token,
    });
  }
  async function saveUsagePointIfNotExist(accountId, usagePointId) {
    await db.t_enedis_usage_point.insert(
      {
        account_id: accountId,
        usage_point_id: usagePointId,
      },
      {
        onConflict: {
          target: ['usage_point_id'],
          action: 'ignore',
        },
      },
    );
  }
  async function getAccessToken(instanceId) {
    const accessTokenInRedis = await redisClient.get(`${ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX}:${instanceId}`);
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
    params.append('redirect_uri', ENEDIS_GLADYS_PLUS_REDIRECT_URI);
    const options = {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: params,
      url: `https://${ENEDIS_BACKEND_URL}/v1/oauth2/token`,
    };
    try {
      const { data } = await axios(options);
      // save new refresh token
      await saveEnedisAccessTokenAndRefreshToken(instanceId, device.id, data);
      // save usage points if not exist
      if (data.usage_points_id) {
        const usagePointsIds = data.usage_points_id.split(',');
        await Promise.each(usagePointsIds, async (usagePointId) => {
          await saveUsagePointIfNotExist(device.account_id, usagePointId);
        });
      }
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
      params: query,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      url: `https://${ENEDIS_BACKEND_URL}${url}`,
    };
    const { data } = await axios(options);
    return data;
  }
  async function getDataDailyConsumption(instanceId, usagePointId, start, end) {
    logger.info(`Enedis - get data daily consumption for usagePoint = ${usagePointId} from start = ${start} to ${end}`);
    const accessToken = await getAccessToken(instanceId);
    const data = {
      usage_point_id: usagePointId,
      start,
      end,
    };
    const response = await makeRequest('/v4/metering_data/daily_consumption', data, accessToken);
    await Promise.each(response.meter_reading.interval_reading, async (reading) => {
      await db.t_enedis_daily_consumption.insert(
        {
          usage_point_id: usagePointId,
          value: reading.value,
          created_at: reading.date,
        },
        {
          onConflict: {
            target: ['usage_point_id', 'created_at'],
            action: 'update',
          },
        },
      );
    });
    return response;
  }
  async function enedisSyncData(job) {
    if (job.name === 'daily-consumption') {
      await getDataDailyConsumption(job.instance_id, job.usage_point_id, job.start, job.end);
    }
  }
  return {
    makeRequest,
    getAccessToken,
    getDataDailyConsumption,
    enedisSyncData,
  };
};
