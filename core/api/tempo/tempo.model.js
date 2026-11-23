const axios = require('axios');
const dayjs = require('dayjs');
const retry = require('async-retry');

const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const { BadRequestError } = require('../../common/error');
const { callOptionalRedisCommand } = require('../../common/redis');
const { getCachedValue, setCachedValue, invalidateCachedValues } = require('../../common/cache');

const TEMPO_CACHE_KEY = 'tempo';
const TEMPO_REDIS_EXPIRY_IN_SECONDS = 5 * 24 * 60 * 60; // 5 days
// Every day of the history (one row per day since the start of Tempo, a few thousand rows),
// cached under a single key whatever the start date asked. Invalidated when the color of the
// day is saved, the expiry is the one of the Cache-Control header of the route.
const TEMPO_HISTORICAL_CACHE_KEY = 'tempo:historical';
const TEMPO_HISTORICAL_CACHE_EXPIRY_IN_SECONDS = 60 * 60;

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
    const todayStartDate = dayjs.tz(dayjs(), 'Europe/Paris').startOf('day').format('YYYY-MM-DDTHH:mm:ssZ');
    const tomorrowStartDate = dayjs
      .tz(dayjs(), 'Europe/Paris')
      .add(1, 'day')
      .startOf('day')
      .format('YYYY-MM-DDTHH:mm:ssZ');
    const tomorrowEndDate = dayjs
      .tz(dayjs(), 'Europe/Paris')
      .add(2, 'day')
      .startOf('day')
      .format('YYYY-MM-DDTHH:mm:ssZ');

    logger.info(`Tempo.getDataLiveOrFromCache: ${todayStartDate} - ${tomorrowStartDate} - ${tomorrowEndDate}`);

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
        // the history now has the day
        await callOptionalRedisCommand(redisClient, () =>
          invalidateCachedValues(redisClient, [TEMPO_HISTORICAL_CACHE_KEY]),
        ).catch((e) => logger.warn(`Tempo: unable to invalidate the historical data cache (${e.message})`));
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

  // The day as stored is returned too (day), to filter the cached history
  const historicalDataColumns = `
    created_at::text as day,
    TO_CHAR(created_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') as created_at,
    day_type
  `;

  async function getHistoricalDataFromDb(startDate) {
    const request = `
      SELECT ${historicalDataColumns}
      FROM t_tempo_historical_data
      WHERE created_at >= $1
      ORDER BY created_at ASC;
    `;
    return db.query(request, [startDate]);
  }

  async function getWholeHistoryFromDb() {
    return db.query(`SELECT ${historicalDataColumns} FROM t_tempo_historical_data ORDER BY created_at ASC;`);
  }

  async function getWholeHistoryFromCacheOrDb() {
    try {
      const historyInCache = await callOptionalRedisCommand(redisClient, () =>
        getCachedValue(redisClient, TEMPO_HISTORICAL_CACHE_KEY),
      );
      if (historyInCache !== null) {
        return historyInCache;
      }
    } catch (e) {
      logger.warn(`Tempo: unable to read the historical data cache (${e.message})`);
    }
    const history = await getWholeHistoryFromDb();
    // not awaited: the response does not wait for Redis to cache the history
    callOptionalRedisCommand(redisClient, () =>
      setCachedValue(redisClient, TEMPO_HISTORICAL_CACHE_KEY, history, TEMPO_HISTORICAL_CACHE_EXPIRY_IN_SECONDS),
    ).catch((e) => {
      logger.warn(`Tempo: unable to cache the historical data (${e.message})`);
    });
    return history;
  }

  // take is a number of days: every day since start_date without it. Anything else than a
  // number used to reach the query, and failed there (500).
  function parseTake(take) {
    if (take === undefined || take === '') {
      return null;
    }
    if (!/^\d+$/.test(String(take))) {
      throw new BadRequestError('take must be a positive integer');
    }
    return parseInt(take, 10);
  }

  /**
   * The colors of the days since start_date (included), take of them at most. Gladys
   * instances ask for the days since their last sync, with a day (YYYY-MM-DD): they are
   * served from the cached history. Any other start date is read in database, as before.
   */
  async function getHistoricalData(params) {
    const { start_date: startDate, take } = params;
    const limit = parseTake(take);
    let days;
    if (typeof startDate === 'string' && dayjs(startDate, 'YYYY-MM-DD', true).isValid()) {
      const history = await getWholeHistoryFromCacheOrDb();
      days = history.filter((day) => day.day >= startDate);
    } else {
      days = await getHistoricalDataFromDb(startDate);
    }
    return days.slice(0, limit === null ? undefined : limit).map(({ created_at: createdAt, day_type: dayType }) => ({
      created_at: createdAt,
      day_type: dayType,
    }));
  }

  return {
    getDataLiveOrFromCache,
    getDataWithRetry,
    getHistoricalData,
  };
};
