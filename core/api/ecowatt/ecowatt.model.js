const axios = require('axios');
const retry = require('async-retry');

const ECOWATT_CACHE_KEY = 'ecowatt:data:v4';
const ECOWATT_REDIS_EXPIRY_IN_SECONDS = 60 * 60; // 1 hour

module.exports = function EcowattModel(logger, redisClient) {
  const { ECOWATT_BASIC_HTTP } = process.env;

  async function getDataFromCache() {
    const ecowattDataFromCache = await redisClient.get(ECOWATT_CACHE_KEY);
    // if present, return
    if (ecowattDataFromCache) {
      return JSON.parse(ecowattDataFromCache);
    }
    return null;
  }

  async function getDataLiveOrFromCache() {
    // Get data from cache
    const dataFromCache = await getDataFromCache();
    if (dataFromCache) {
      logger.debug('Ecowatt: returning data from cache');
      return dataFromCache;
    }
    // Get data live
    const { data: dataToken } = await axios.post('https://digital.iservices.rte-france.com/token/oauth/', {
      headers: {
        authorization: `Basic ${ECOWATT_BASIC_HTTP}`,
      },
    });

    const { data } = await axios.get('https://digital.iservices.rte-france.com/open_api/ecowatt/v4/signals', {
      headers: {
        authorization: `Bearer ${dataToken.access_token}`,
      },
    });

    // Set cache
    await redisClient.set(ECOWATT_CACHE_KEY, JSON.stringify(data), {
      EX: ECOWATT_REDIS_EXPIRY_IN_SECONDS,
    });

    return data;
  }

  async function getDataWithRetry() {
    const options = {
      retries: 3,
      factor: 2,
      minTimeout: 50,
    };
    return retry(async () => getDataLiveOrFromCache(), options);
  }

  return {
    getDataLiveOrFromCache,
    getDataWithRetry,
  };
};
