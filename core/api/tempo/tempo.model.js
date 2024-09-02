const axios = require('axios');
const dayjs = require('dayjs');
const retry = require('async-retry');

const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const TEMPO_CACHE_KEY = 'tempo';
const TEMPO_REDIS_EXPIRY_IN_SECONDS = 5 * 24 * 60 * 60; // 5 days

module.exports = function TempoModel(logger, redisClient) {
  // the key is the same as ecowatt
  const { ECOWATT_BASIC_HTTP } = process.env;

  async function getDataFromCache(date) {
    return redisClient.get(`${TEMPO_CACHE_KEY}:${date}`);
  }

  async function getDataLiveOrFromCache() {
    const todayStartDate = dayjs().tz('Europe/Paris').startOf('day').format('YYYY-MM-DDTHH:mm:ssZ');
    const todayEndDate = dayjs().tz('Europe/Paris').endOf('day').format('YYYY-MM-DDTHH:mm:ssZ');

    const tomorrowStartDate = dayjs().tz('Europe/Paris').add(1, 'day').startOf('day').format('YYYY-MM-DDTHH:mm:ssZ');
    const tomorrowEndDate = dayjs().tz('Europe/Paris').add(1, 'day').endOf('day').format('YYYY-MM-DDTHH:mm:ssZ');

    // Get today data from cache
    let todayData = await getDataFromCache(todayStartDate);
    let tomorrowData = await getDataFromCache(tomorrowStartDate);

    let accessToken;

    if (!todayData || !tomorrowData) {
      // Get new access token
      const { data: dataToken } = await axios.post('https://digital.iservices.rte-france.com/token/oauth/', null, {
        headers: {
          authorization: `Basic ${ECOWATT_BASIC_HTTP}`,
        },
      });
      accessToken = dataToken.access_token;
    }

    if (!todayData) {
      try {
        const { data: todayLiveData } = await axios.get(
          'https://digital.iservices.rte-france.com/open_api/tempo_like_supply_contract/v1/tempo_like_calendars',
          {
            params: {
              start_date: todayStartDate,
              end_date: todayEndDate,
            },
            headers: {
              authorization: `Bearer ${accessToken}`,
            },
          },
        );
        todayData = todayLiveData.tempo_like_calendars.values[0].value.toLowerCase();
        // Set cache
        await redisClient.set(`${TEMPO_CACHE_KEY}:${todayStartDate}`, todayData, {
          EX: TEMPO_REDIS_EXPIRY_IN_SECONDS,
        });
      } catch (e) {
        logger.debug(e);
        todayData = 'unknown';
      }
    }

    if (!tomorrowData) {
      try {
        const { data: tomorrowLiveData } = await axios.get(
          'https://digital.iservices.rte-france.com/open_api/tempo_like_supply_contract/v1/tempo_like_calendars',
          {
            params: {
              start_date: tomorrowStartDate,
              end_date: tomorrowEndDate,
            },
            headers: {
              authorization: `Bearer ${accessToken}`,
            },
          },
        );
        tomorrowData = tomorrowLiveData.tempo_like_calendars.values[0].value.toLowerCase();
        // Set cache
        await redisClient.set(`${TEMPO_CACHE_KEY}:${tomorrowStartDate}`, tomorrowData, {
          EX: TEMPO_REDIS_EXPIRY_IN_SECONDS,
        });
      } catch (e) {
        logger.debug(e);
        tomorrowData = 'unknown';
        // Set cache for 30 minutes to avoid querying to much the API
        await redisClient.set(`${TEMPO_CACHE_KEY}:${tomorrowStartDate}`, tomorrowData, {
          EX: 30 * 60, // null set to 30 minutes
        });
      }
    }

    return {
      today: todayData,
      tomorrow: tomorrowData,
    };
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
