const crypto = require('crypto');
const { Queue } = require('bullmq');
const Promise = require('bluebird');

const {
  ENEDIS_WORKER_KEY,
  BULLMQ_PUBLISH_JOB_OPTIONS,
  ENEDIS_REFRESH_ALL_DATA_JOB_KEY,
  ENEDIS_DAILY_REFRESH_ALL_USERS_JOB_KEY,
} = require('../../enedis/enedis.constants');
const { ServerError } = require('../../common/error');

const ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX = 'enedis-grant-access-token:';

module.exports = function EnedisModel(logger, db, redisClient, enedisCoreModel) {
  const { ENEDIS_GRANT_CLIENT_ID, ENEDIS_AUTHORIZE_URL } = process.env;

  const queue = new Queue(ENEDIS_WORKER_KEY, {
    connection: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
    },
  });

  async function getRedirectUri() {
    const params = new URLSearchParams({
      client_id: ENEDIS_GRANT_CLIENT_ID,
      response_type: 'code',
      duration: 'P2Y',
      state: `${crypto.randomUUID()}7`, // add a 7 for the sandbox
      //  Remove redirect_uri for Enedis PROD. Keeping the comment in case it's needed for test env
      //  redirect_uri: ENEDIS_GLADYS_PLUS_REDIRECT_URI,
    });
    return `${ENEDIS_AUTHORIZE_URL}?${params.toString()}`;
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

  async function getPrimaryAccountId(user) {
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
    return instances.length > 0 ? instances[0].account_id : null;
  }

  async function resetEnedisDevicesAndCreateNew(user) {
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

    // Create a new Enedis device
    const newDevice = {
      id: crypto.randomUUID(),
      name: 'Enedis',
      client_id: ENEDIS_GRANT_CLIENT_ID,
      user_id: user.id,
    };

    await db.t_device.insert(newDevice);

    return instances.length > 0 ? instances[0].account_id : null;
  }

  async function handleAcceptGrantMessage(authorizationCode, user, usagePointsIds = []) {
    logger.info(`Enedis.handleAcceptGrantMessage : ${user.id}`);
    const accountId = await resetEnedisDevicesAndCreateNew(user);

    // Save usage points ids
    await Promise.each(usagePointsIds, async (usagePointId) => {
      await saveUsagePointIfNotExist(accountId, usagePointId);
    });

    return {
      usage_points_id: usagePointsIds,
    };
  }

  async function getUsagePointsOfAccount(accountId) {
    const getUsagePointsSql = `
      SELECT usage_point_id
      FROM t_enedis_usage_point
      WHERE account_id = $1;
    `;
    const rows = await db.query(getUsagePointsSql, [accountId]);
    return rows.map((row) => row.usage_point_id);
  }

  async function handleAcceptAuthorization(autorisationId, user) {
    logger.info(`Enedis.handleAcceptAuthorization : ${user.id}`);
    const accountId = await getPrimaryAccountId(user);

    // Devices that were linked before this consent. They are only revoked once the
    // new authorization is confirmed, so a failed exchange cannot leave the account
    // without a working Enedis connection.
    const previousDevices = await db.t_device.find(
      {
        client_id: ENEDIS_GRANT_CLIENT_ID,
        user_id: user.id,
        revoked: false,
        is_deleted: false,
      },
      {
        fields: ['id'],
      },
    );

    // A device is needed before the exchange: it is what allows an access token
    // to be minted for this account.
    const newDevice = {
      id: crypto.randomUUID(),
      name: 'Enedis',
      client_id: ENEDIS_GRANT_CLIENT_ID,
      user_id: user.id,
    };
    await db.t_device.insert(newDevice);

    // Clearing the cached access token is not destructive: it is only a cache and the
    // token can always be minted again. Unlike the devices, it can be cleared upfront.
    if (accountId) {
      await redisClient.del(`${ENEDIS_GRANT_ACCESS_TOKEN_REDIS_PREFIX}:${accountId}`);
    }

    let usagePointsIds;
    try {
      // New DataConnect 2026 flow: the redirect URL no longer contains the usage points ids,
      // we need to exchange the autorisation_id for the usage points ids (PRM)
      // with the Enedis "services souscrits" API
      usagePointsIds = await enedisCoreModel.getUsagePointsFromAuthorization(accountId, autorisationId);

      // An authorization that resolves to no meter means the consent was not usable:
      // fail instead of returning a success with the meters already linked, which
      // would hide the problem while the authorization id is consumed.
      if (usagePointsIds.length === 0) {
        logger.warn(`Enedis.handleAcceptAuthorization: no usage point found for user ${user.id}`);
        throw new ServerError();
      }
    } catch (e) {
      // Roll back the device created for this attempt, leaving the previous connection intact
      await db.t_device.update(newDevice.id, {
        revoked: true,
        is_deleted: true,
      });
      throw e;
    }

    // The new authorization is confirmed, the previous devices can be replaced
    await Promise.each(previousDevices, async (previousDevice) => {
      await db.t_device.update(previousDevice.id, {
        revoked: true,
        is_deleted: true,
      });
    });

    // Save usage points ids
    await Promise.each(usagePointsIds, async (usagePointId) => {
      await saveUsagePointIfNotExist(accountId, usagePointId);
    });

    // The new flow only allows the customer to consent for one PRM at a time,
    // so we return all the usage points of the account (previously linked ones included)
    // to avoid dropping previously linked meters on the client side
    const allUsagePointsIds = await getUsagePointsOfAccount(accountId);

    return {
      usage_points_id: allUsagePointsIds,
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
        AND t_enedis_daily_consumption.created_at > $5
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
        AND t_enedis_consumption_load_curve.created_at > $5
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

  async function getEnedisSync(userId, take = 10) {
    const getEnedisSyncSql = `
        SELECT es.*
        FROM t_user u
        INNER JOIN t_account a ON a.id = u.account_id
        INNER JOIN t_enedis_usage_point eup ON eup.account_id = a.id
        INNER JOIN t_enedis_sync es ON es.usage_point_id = eup.usage_point_id
        WHERE u.id = $1
        ORDER BY es.created_at DESC
        LIMIT $2
    `;
    const enedisSync = await db.query(getEnedisSyncSql, [userId, take]);

    return enedisSync;
  }

  async function refreshAlldata(userId) {
    await queue.add(ENEDIS_REFRESH_ALL_DATA_JOB_KEY, { userId }, BULLMQ_PUBLISH_JOB_OPTIONS);
  }

  async function dailyRefreshForAllUsers() {
    await queue.add(ENEDIS_DAILY_REFRESH_ALL_USERS_JOB_KEY, {}, BULLMQ_PUBLISH_JOB_OPTIONS);
  }

  return {
    handleAcceptGrantMessage,
    handleAcceptAuthorization,
    getRedirectUri,
    getDailyConsumption,
    getConsumptionLoadCurve,
    refreshAlldata,
    dailyRefreshForAllUsers,
    getEnedisSync,
  };
};
