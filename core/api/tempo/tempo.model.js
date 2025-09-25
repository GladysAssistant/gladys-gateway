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

module.exports = function TempoModel(logger, db, redisClient) {
  // the key is the same as ecowatt
  const { ECOWATT_BASIC_HTTP } = process.env;

  async function getDataFromCache(date) {
    return redisClient.get(`${TEMPO_CACHE_KEY}:${date}`);
  }

  async function getDataFromDb(date) {
    const request = `
      SELECT day_type 
      FROM t_tempo_historical_data
      WHERE created_at = $1;
    `;
    const tempoData = await db.query(request, [date]);
    if (tempoData.length === 0) {
      return null;
    }
    return tempoData[0].day_type;
  }

  async function getDataLiveOrFromCache() {
    const todayStartDate = dayjs().tz('Europe/Paris').startOf('day').format('YYYY-MM-DDTHH:mm:ssZ');
    const tomorrowStartDate = dayjs().tz('Europe/Paris').add(1, 'day').startOf('day').format('YYYY-MM-DDTHH:mm:ssZ');
    const tomorrowEndDate = dayjs().tz('Europe/Paris').add(2, 'day').startOf('day').format('YYYY-MM-DDTHH:mm:ssZ');

    // Get today data from DB
    let todayData = await getDataFromDb(todayStartDate.split('T')[0]);
    // Get tomorrow data from cache in Redis (because we are never sure)
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
              end_date: tomorrowStartDate,
            },
            headers: {
              authorization: `Bearer ${accessToken}`,
            },
          },
        );
        todayData = todayLiveData.tempo_like_calendars.values[0].value.toLowerCase();
        // Save data in DB
        await db.t_tempo_historical_data.insert(
          {
            created_at: todayStartDate.split('T')[0],
            day_type: todayData,
          },
          {
            onConflict: {
              target: ['created_at'],
              action: 'update',
            },
          },
        );
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

  async function getHistoricalData(params) {
    const { start_date: startDate, take } = params;
    const request = `
      SELECT TO_CHAR(created_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') as created_at, day_type 
      FROM t_tempo_historical_data
      WHERE created_at >= $1
      ORDER BY created_at ASC
      LIMIT $2;
    `;
    const tempoData = await db.query(request, [startDate, take]);
    return tempoData;
  }

  return {
    getDataLiveOrFromCache,
    getDataWithRetry,
    getHistoricalData,
  };
};
