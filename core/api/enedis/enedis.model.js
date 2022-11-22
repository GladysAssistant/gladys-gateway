const uuid = require('uuid');
const axios = require('axios');
const { Queue } = require('bullmq');

const {
  ENEDIS_WORKER_KEY,
  BULLMQ_PUBLISH_JOB_OPTIONS,
  ENEDIS_REFRESH_ALL_DATA_JOB_KEY,
} = require('../../enedis/enedis.constants');

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

  async function getRedirectUri() {
    const url = `https://${ENEDIS_BACKEND_URL}/dataconnect/v1/oauth2/authorize`;
    const params = new URLSearchParams({
      client_id: ENEDIS_GRANT_CLIENT_ID,
      response_type: 'code',
      state: `${uuid.v4()}7`, // add a 7 for the sandbox
      duration: 'P3Y',
    });
    return `${url}?${params.toString()}`;
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
    // Delete all devices that could exist prior to this operation
    await db.t_device.update(
      {
        client_id: ENEDIS_GRANT_CLIENT_ID,
        user_id: user.id,
        revoked: false,
        is_deleted: false,
      },
      {
        revoked: true,
        is_deleted: true,
      },
    );
    // Clear Redis
    const getInstanceIdByUserId = `
      SELECT t_instance.id, t_instance.account_id
      FROM t_user
      INNER JOIN t_account ON t_account.id = t_user.account_id
      INNER JOIN t_instance ON t_instance.account_id = t_account.id
      WHERE t_user.id = $1
      AND t_instance.primary_instance = true
      AND t_instance.is_deleted = false;
      
    `;
    const instances = await db.query(getInstanceIdByUserId, [user.id]);
    if (instances.length > 0) {
      await redisClient.del(`${ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX}:${instances[0].account_id}`);
    }
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

  async function getDailyConsumption(instanceId, usagePointId, take, after) {
    const getDailyConsumptions = `
        SELECT t_enedis_daily_consumption.value, 
        t_enedis_daily_consumption.created_at::text
        FROM t_enedis_daily_consumption
        INNER JOIN t_enedis_usage_point ON t_enedis_daily_consumption.usage_point_id = t_enedis_usage_point.usage_point_id
        INNER JOIN t_instance ON t_enedis_usage_point.account_id = t_instance.account_id
        WHERE t_instance.id = $1
        AND t_enedis_daily_consumption.usage_point_id = $3
        AND t_enedis_daily_consumption.created_at >= $5
        ORDER BY created_at ASC
        LIMIT $4;
    `;
    const dailyConsumptions = await db.query(getDailyConsumptions, [
      instanceId,
      ENEDIS_GRANT_CLIENT_ID,
      usagePointId,
      take,
      after,
    ]);

    return dailyConsumptions;
  }

  async function getConsumptionLoadCurve(instanceId, usagePointId, take, after) {
    const getConsumptionLoadCurveSql = `
        SELECT t_enedis_consumption_load_curve.value, t_enedis_consumption_load_curve.created_at
        FROM t_enedis_consumption_load_curve
        INNER JOIN t_enedis_usage_point ON t_enedis_consumption_load_curve.usage_point_id = t_enedis_usage_point.usage_point_id
        INNER JOIN t_instance ON t_enedis_usage_point.account_id = t_instance.account_id
        WHERE t_instance.id = $1
        AND t_enedis_consumption_load_curve.usage_point_id = $3
        AND t_enedis_consumption_load_curve.created_at >= $5
        LIMIT $4;
    `;
    const dailyConsumptions = await db.query(getConsumptionLoadCurveSql, [
      instanceId,
      ENEDIS_GRANT_CLIENT_ID,
      usagePointId,
      take,
      after,
    ]);

    return dailyConsumptions;
  }

  async function refreshAlldata(userId) {
    await queue.add(ENEDIS_REFRESH_ALL_DATA_JOB_KEY, { userId }, BULLMQ_PUBLISH_JOB_OPTIONS);
  }

  return {
    handleAcceptGrantMessage,
    getRedirectUri,
    getDailyConsumption,
    getConsumptionLoadCurve,
    refreshAlldata,
  };
};
