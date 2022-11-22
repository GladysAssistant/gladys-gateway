const axios = require('axios');
const get = require('get-value');
const Promise = require('bluebird');
const dayjs = require('dayjs');
const { Queue } = require('bullmq');

const { ForbiddenError, NotFoundError } = require('../common/error');
const {
  ENEDIS_WORKER_KEY,
  ENEDIS_GET_DAILY_CONSUMPTION_JOB_KEY,
  BULLMQ_PUBLISH_JOB_OPTIONS,
  ENEDIS_REFRESH_ALL_DATA_JOB_KEY,
} = require('./enedis.constants');

const ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX = 'enedis-grant-access-token:';

module.exports = function EnedisModel(logger, db, redisClient) {
  const { ENEDIS_GRANT_CLIENT_ID, ENEDIS_GRANT_CLIENT_SECRET, ENEDIS_BACKEND_URL, ENEDIS_GLADYS_PLUS_REDIRECT_URI } =
    process.env;

  const queue = new Queue(ENEDIS_WORKER_KEY, {
    connection: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
    },
  });

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
    let response;
    try {
      response = await makeRequest('/v4/metering_data/daily_consumption', data, accessToken);
    } catch (e) {
      // if the response is 404 not found
      // It just mean the user has no data at this period so it's fine
      if (get(e, 'response.status') === 404) {
        return null;
      }
      // Else, it's a problem, we exit to be replayed
      throw e;
    }

    // Foreach data points, we insert in DB if not exist
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
  async function getUsagePoints(accountId) {
    const getUsagePointsSql = `
      SELECT t_enedis_usage_point.usage_point_id
      FROM t_enedis_usage_point
      WHERE account_id = $1;
    `;
    const rows = await db.query(getUsagePointsSql, [accountId]);
    return rows.map((row) => row.usage_point_id);
  }
  async function refreshAllData(job) {
    // find instance id per user id
    const getInstanceIdSql = `
      SELECT t_instance.id, t_instance.account_id
      FROM t_instance
      INNER JOIN t_account ON t_account.id = t_instance.account_id
      INNER JOIN t_user ON t_user.account_id = t_account.id
      WHERE t_user.id = $1
      AND t_instance.primary_instance = TRUE;
    `;
    const rows = await db.query(getInstanceIdSql, [job.userId]);
    if (rows.length === 0) {
      throw new NotFoundError('NO_INSTANCE_FOUND');
    }
    const instance = rows[0];
    // Get access token to eventuall refresh usage points ids
    await getAccessToken(instance.id);
    // Find all usage points
    const usagePointIds = await getUsagePoints(instance.account_id);

    // Foreach usage points, we generate one job per request to make
    await Promise.each(usagePointIds, async (usagePointId) => {
      const twoYearAgo = dayjs().subtract(2, 'years');

      let currendEndDate = dayjs();
      const syncTasksArray = [];

      while (currendEndDate > twoYearAgo) {
        let startDate = currendEndDate.subtract(7, 'days');
        if (startDate < twoYearAgo) {
          startDate = twoYearAgo;
        }
        syncTasksArray.push({
          start: startDate.format('YYYY-MM-DD'),
          end: currendEndDate.format('YYYY-MM-DD'),
        });
        currendEndDate = startDate;
      }
      syncTasksArray.reverse();
      // We publish one BullMQ job per request
      await Promise.each(syncTasksArray, async (task) => {
        const toPublish = {
          usage_point_id: usagePointId,
          ...task,
        };
        await queue.add(ENEDIS_GET_DAILY_CONSUMPTION_JOB_KEY, toPublish, BULLMQ_PUBLISH_JOB_OPTIONS);
      });
    });
  }
  async function enedisSyncData(job) {
    if (job.name === ENEDIS_GET_DAILY_CONSUMPTION_JOB_KEY) {
      await getDataDailyConsumption(job.instance_id, job.usage_point_id, job.start, job.end);
    }
    if (job.name === ENEDIS_REFRESH_ALL_DATA_JOB_KEY) {
      await refreshAllData(job);
    }
  }
  return {
    queue,
    makeRequest,
    getAccessToken,
    getDataDailyConsumption,
    enedisSyncData,
    refreshAllData,
  };
};
