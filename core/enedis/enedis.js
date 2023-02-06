const axios = require('axios');
const get = require('get-value');
const Promise = require('bluebird');
const dayjs = require('dayjs');
const { Queue } = require('bullmq');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const { ForbiddenError, NotFoundError } = require('../common/error');
const {
  ENEDIS_WORKER_KEY,
  ENEDIS_GET_DAILY_CONSUMPTION_JOB_KEY,
  ENEDIS_GET_CONSUMPTION_LOAD_CURVE_JOB_KEY,
  ENEDIS_DAILY_REFRESH_ALL_USERS_JOB_KEY,
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

  // queue.add(ENEDIS_REFRESH_ALL_DATA_JOB_KEY, { userId: 'd35d2615-5a56-4aae-95a9-1b29a3b827ce' });

  async function saveEnedisAccessTokenAndRefreshToken(accountId, deviceId, data) {
    await redisClient.set(
      `${ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX}:${accountId}`,
      data.access_token,
      'EX',
      data.expires_in - 60, // We remove 1 minute to be safe
    );

    await db.t_device.update(deviceId, {
      provider_refresh_token: data.refresh_token,
    });
  }
  async function getAccessToken(accountId) {
    const accessTokenInRedis = await redisClient.get(`${ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX}:${accountId}`);
    if (accessTokenInRedis) {
      return accessTokenInRedis;
    }
    const getDevicesWithEnedisActivated = `
        SELECT DISTINCT t_user.id, t_user.account_id, 
        t_device.id as device_id, t_device.provider_refresh_token
        FROM t_user
        INNER JOIN t_device ON t_user.id = t_device.user_id
        WHERE t_user.account_id = $1
        AND t_device.revoked = false
        AND t_device.is_deleted = false
        AND t_device.client_id = $2;
    `;
    const devices = await db.query(getDevicesWithEnedisActivated, [accountId, ENEDIS_GRANT_CLIENT_ID]);
    if (devices.length === 0) {
      logger.warn(`Forbidden: Enedis Oauth process was not done`);
      throw new ForbiddenError();
    }
    const device = devices[0];
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', ENEDIS_GRANT_CLIENT_ID);
    params.append('client_secret', ENEDIS_GRANT_CLIENT_SECRET);
    params.append('redirect_uri', ENEDIS_GLADYS_PLUS_REDIRECT_URI);
    const options = {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: params,
      url: `https://${ENEDIS_BACKEND_URL}/oauth2/v3/token`,
    };
    try {
      const { data } = await axios(options);
      // save new refresh token
      await saveEnedisAccessTokenAndRefreshToken(accountId, device.id, data);
      return data.access_token;
    } catch (e) {
      logger.error(e);
      // if status is 400, token is invalid, revoke token
      if (get(e, 'response.status') === 400) {
        logger.warn(e);
        await db.t_device.update(device.device_id, {
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
  async function increaseSyncJobDone(syncId) {
    const updateSyncQuery = `
      UPDATE t_enedis_sync
      SET jobs_done = jobs_done + 1, 
      updated_at = NOW()
      WHERE id = $1;
    `;
    await db.query(updateSyncQuery, [syncId]);
  }
  async function getDataDailyConsumption(accountId, usagePointId, start, end, syncId) {
    logger.info(`Enedis - get data daily consumption for usagePoint = ${usagePointId} from start = ${start} to ${end}`);
    const accessToken = await getAccessToken(accountId);
    const data = {
      usage_point_id: usagePointId,
      start,
      end,
    };
    let response;
    try {
      response = await makeRequest('/metering_data_dc/v5/daily_consumption', data, accessToken);
    } catch (e) {
      // if the response is 404 not found
      // It just mean the user has no data at this period so it's fine
      if (get(e, 'response.status') === 404) {
        return null;
      }
      logger.error(e);
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
    await increaseSyncJobDone(syncId);
    return response;
  }
  async function getConsumptionLoadCurve(accountId, usagePointId, start, end, syncId) {
    logger.info(`Enedis - get consumption load curve for usagePoint = ${usagePointId} from start = ${start} to ${end}`);
    const accessToken = await getAccessToken(accountId);
    const data = {
      usage_point_id: usagePointId,
      start,
      end,
    };
    let response;
    try {
      response = await makeRequest('/metering_data_clc/v5/consumption_load_curve', data, accessToken);
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
      await db.t_enedis_consumption_load_curve.insert(
        {
          usage_point_id: usagePointId,
          value: reading.value,
          // Enedis integration is for french users, so timezone is always french one
          created_at: dayjs.tz(reading.date, 'Europe/Paris'),
        },
        {
          onConflict: {
            target: ['usage_point_id', 'created_at'],
            action: 'update',
          },
        },
      );
    });

    await increaseSyncJobDone(syncId);

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
    logger.info(`Enedis: refreshing all data for user ${job.userId}`);
    // find account per user id
    const getAccountPerUserSql = `
      SELECT t_account.id
      FROM t_account
      INNER JOIN t_user ON t_user.account_id = t_account.id
      WHERE t_user.id = $1;
    `;
    const rows = await db.query(getAccountPerUserSql, [job.userId]);
    if (rows.length === 0) {
      throw new NotFoundError('ACCOUNT_NOT_FOUND');
    }
    const account = rows[0];
    // Get access token to eventuall refresh usage points ids
    await getAccessToken(account.id);
    // Find all usage points
    const usagePointIds = await getUsagePoints(account.id);
    logger.info(`Enedis: Found ${usagePointIds.length} usage points for user ${job.userId}`);
    // Foreach usage points, we generate one job per request to make
    await Promise.each(usagePointIds, async (usagePointId) => {
      const oldestDate = job.start ? dayjs(job.start) : dayjs().subtract(2, 'years');

      let currendEndDate = dayjs();
      const syncTasksArray = [];

      while (currendEndDate > oldestDate) {
        let startDate = currendEndDate.subtract(7, 'days');
        if (startDate < oldestDate) {
          startDate = oldestDate;
        }
        syncTasksArray.push({
          start: startDate.format('YYYY-MM-DD'),
          end: currendEndDate.format('YYYY-MM-DD'),
        });
        currendEndDate = startDate;
      }
      syncTasksArray.reverse();
      const syncInserted = await db.t_enedis_sync.insert({
        usage_point_id: usagePointId,
        jobs_total: syncTasksArray.length * 2,
      });
      // We publish one BullMQ job per request
      await Promise.each(syncTasksArray, async (task) => {
        const toPublish = {
          usage_point_id: usagePointId,
          ...task,
          account_id: account.id,
          sync_id: syncInserted.id,
        };
        await queue.add(ENEDIS_GET_DAILY_CONSUMPTION_JOB_KEY, toPublish, BULLMQ_PUBLISH_JOB_OPTIONS);
        await queue.add(ENEDIS_GET_CONSUMPTION_LOAD_CURVE_JOB_KEY, toPublish, BULLMQ_PUBLISH_JOB_OPTIONS);
      });
    });
  }
  async function dailyRefreshOfAllUsers() {
    const getAllUsersWithEnedisSql = `
        SELECT DISTINCT t_user.id
        FROM t_user
        INNER JOIN t_device ON t_user.id = t_device.user_id
        WHERE t_device.revoked = false
        AND t_device.is_deleted = false
        AND t_device.client_id = $1;
    `;
    const usersToRefresh = await db.query(getAllUsersWithEnedisSql, [ENEDIS_GRANT_CLIENT_ID]);
    const twoDaysAgo = dayjs().subtract(2, 'day');
    logger.info(`Enedis: Daily refresh of all users. Refreshing ${usersToRefresh.length} users`);
    await Promise.each(usersToRefresh, async (userToRefresh) => {
      await refreshAllData({ userId: userToRefresh.id, start: twoDaysAgo });
    });
  }
  async function enedisSyncData(job) {
    try {
      // logger.debug(job);
      if (job.name === ENEDIS_GET_DAILY_CONSUMPTION_JOB_KEY) {
        return getDataDailyConsumption(
          job.data.account_id,
          job.data.usage_point_id,
          job.data.start,
          job.data.end,
          job.data.sync_id,
        );
      }
      if (job.name === ENEDIS_GET_CONSUMPTION_LOAD_CURVE_JOB_KEY) {
        return getConsumptionLoadCurve(
          job.data.account_id,
          job.data.usage_point_id,
          job.data.start,
          job.data.end,
          job.data.sync_id,
        );
      }
      if (job.name === ENEDIS_REFRESH_ALL_DATA_JOB_KEY) {
        return refreshAllData(job.data);
      }
      if (job.name === ENEDIS_DAILY_REFRESH_ALL_USERS_JOB_KEY) {
        return dailyRefreshOfAllUsers(job.data);
      }
    } catch (e) {
      logger.error(e);
      throw e;
    }
    return null;
  }
  return {
    queue,
    makeRequest,
    getAccessToken,
    getDataDailyConsumption,
    getConsumptionLoadCurve,
    enedisSyncData,
    refreshAllData,
    dailyRefreshOfAllUsers,
  };
};
