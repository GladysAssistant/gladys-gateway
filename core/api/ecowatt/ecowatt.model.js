const axios = require('axios');
const retry = require('async-retry');

// Fresh copy of the RTE data, refreshed once it expires
const ECOWATT_CACHE_KEY = 'ecowatt:data:v4';
const ECOWATT_REDIS_EXPIRY_IN_SECONDS = 60 * 60; // 1 hour
// Last data successfully fetched from RTE, kept without TTL so it can still be
// served when RTE fails (429 / 500) instead of failing the request
const ECOWATT_STALE_CACHE_KEY = 'ecowatt:data:v4:stale';
// RTE answers 429 when called too often: wait several seconds between attempts
// (2s, 4s, 8s) rather than hammering it 4 times in less than a second
const ECOWATT_RETRY_RETRIES = 3;
const ECOWATT_RETRY_FACTOR = 2;
const ECOWATT_RETRY_DEFAULT_MIN_TIMEOUT_IN_MS = 2000;
// Lock taken with SET NX EX so only one gateway instance refreshes the data
// from RTE when the cache expires, instead of every instance at the same time
const ECOWATT_REFRESH_LOCK_KEY = 'ecowatt:refresh-lock:v4';
// Must cover the whole retry sequence (14s of backoff + 4 round trips to RTE),
// see the test asserting it. A failed refresh keeps the lock until it expires,
// which acts as a cooldown before calling RTE again
const ECOWATT_REFRESH_LOCK_EXPIRY_IN_SECONDS = 60;
// An instance without any data (fresh or stale) while another one is refreshing
// polls the cache instead of calling RTE itself, for as long as the lock lives
const ECOWATT_WAIT_FOR_REFRESH_DEFAULT_INTERVAL_IN_MS = 500;

module.exports = function EcowattModel(logger, redisClient) {
  const { ECOWATT_BASIC_HTTP } = process.env;
  // Overridable so tests don't have to wait for the real backoff
  const retryMinTimeoutInMs =
    parseInt(process.env.ECOWATT_RETRY_MIN_TIMEOUT_IN_MS, 10) || ECOWATT_RETRY_DEFAULT_MIN_TIMEOUT_IN_MS;
  const waitForRefreshIntervalInMs =
    parseInt(process.env.ECOWATT_WAIT_FOR_REFRESH_INTERVAL_IN_MS, 10) ||
    ECOWATT_WAIT_FOR_REFRESH_DEFAULT_INTERVAL_IN_MS;

  async function getDataFromCache(key = ECOWATT_CACHE_KEY) {
    const ecowattDataFromCache = await redisClient.get(key);
    // if present, return
    if (ecowattDataFromCache) {
      return JSON.parse(ecowattDataFromCache);
    }
    return null;
  }

  async function getDataLive() {
    const { data: dataToken } = await axios.post('https://digital.iservices.rte-france.com/token/oauth/', null, {
      headers: {
        authorization: `Basic ${ECOWATT_BASIC_HTTP}`,
      },
    });

    const { data } = await axios.get('https://digital.iservices.rte-france.com/open_api/ecowatt/v5/signals', {
      headers: {
        authorization: `Bearer ${dataToken.access_token}`,
      },
    });

    // Set cache: the fresh copy expires, the stale copy is kept until the next successful refresh
    const serializedData = JSON.stringify(data);
    await redisClient
      .multi()
      .set(ECOWATT_CACHE_KEY, serializedData, {
        EX: ECOWATT_REDIS_EXPIRY_IN_SECONDS,
      })
      .set(ECOWATT_STALE_CACHE_KEY, serializedData)
      .exec();

    return data;
  }

  async function getDataLiveWithRetry() {
    const options = {
      retries: ECOWATT_RETRY_RETRIES,
      factor: ECOWATT_RETRY_FACTOR,
      minTimeout: retryMinTimeoutInMs,
    };
    return retry(async () => getDataLive(), options);
  }

  async function acquireRefreshLock() {
    const lockAcquired = await redisClient.set(ECOWATT_REFRESH_LOCK_KEY, '1', {
      NX: true,
      EX: ECOWATT_REFRESH_LOCK_EXPIRY_IN_SECONDS,
    });
    return lockAcquired !== null;
  }

  async function releaseRefreshLock() {
    await redisClient.del(ECOWATT_REFRESH_LOCK_KEY);
  }

  // Refresh the data from RTE, then serve the stale copy if RTE fails
  async function refreshData(staleData) {
    try {
      const data = await getDataLiveWithRetry();
      await releaseRefreshLock();
      return data;
    } catch (e) {
      if (!staleData) {
        // Nothing to serve: release the lock so the instances waiting on it
        // fail right away instead of polling until the lock expires
        await releaseRefreshLock();
        throw e;
      }
      // The lock is kept on purpose: it expires on its own and prevents
      // calling RTE again right away while it is failing
      logger.warn(`Ecowatt: RTE failed (${e.message}), returning stale data`);
      return staleData;
    }
  }

  // Poll the cache until the instance holding the lock has refreshed it. The wait
  // is bounded by the lock lifetime, which always covers the holder's retry
  // sequence, and stops early once the lock is gone: the holder either succeeded
  // (the data is in cache) or failed without stale data (the lock was released)
  async function waitForRefreshedData() {
    const options = {
      retries: Math.ceil((ECOWATT_REFRESH_LOCK_EXPIRY_IN_SECONDS * 1000) / waitForRefreshIntervalInMs),
      factor: 1,
      minTimeout: waitForRefreshIntervalInMs,
    };
    return retry(async (bail) => {
      // Read the lock before the data: the holder writes the data before releasing the lock
      const lockStillHeld = await redisClient.exists(ECOWATT_REFRESH_LOCK_KEY);
      const data = await getDataFromCache();
      if (data) {
        return data;
      }
      if (!lockStillHeld) {
        bail(new Error('Ecowatt: no data available, the refresh on another instance failed'));
        return null;
      }
      throw new Error('Ecowatt: data is being refreshed by another instance and is not available yet');
    }, options);
  }

  async function getDataLiveOrFromCache() {
    // Get data from cache
    const dataFromCache = await getDataFromCache();
    if (dataFromCache) {
      logger.debug('Ecowatt: returning data from cache');
      return dataFromCache;
    }
    const staleData = await getDataFromCache(ECOWATT_STALE_CACHE_KEY);
    if (!(await acquireRefreshLock())) {
      // Another instance is already refreshing the data
      if (staleData) {
        logger.debug('Ecowatt: refresh in progress on another instance, returning stale data');
        return staleData;
      }
      return waitForRefreshedData();
    }
    // The cache may have been refreshed between our first read and the lock
    const dataRefreshedMeanwhile = await getDataFromCache();
    if (dataRefreshedMeanwhile) {
      await releaseRefreshLock();
      return dataRefreshedMeanwhile;
    }
    return refreshData(staleData);
  }

  return {
    getDataLiveOrFromCache,
  };
};

module.exports.constants = {
  ECOWATT_CACHE_KEY,
  ECOWATT_STALE_CACHE_KEY,
  ECOWATT_REFRESH_LOCK_KEY,
  ECOWATT_REFRESH_LOCK_EXPIRY_IN_SECONDS,
  ECOWATT_RETRY_RETRIES,
  ECOWATT_RETRY_FACTOR,
  ECOWATT_RETRY_DEFAULT_MIN_TIMEOUT_IN_MS,
};
