const tracer = require('tracer');
const redis = require('redis');
const massive = require('massive');
const { Worker } = require('bullmq');
const get = require('get-value');

const EnedisModel = require('./enedis');
const {
  ENEDIS_WORKER_KEY,
  ENEDIS_WORKER_LIMITER,
  ENEDIS_RATE_LIMITED_DEFAULT_PAUSE_IN_MS,
  ENEDIS_RATE_LIMITED_MAX_PAUSE_IN_MS,
} = require('./enedis.constants');

/**
 * Returns how long to pause the queue after a 429, from the Retry-After header,
 * which holds either a number of seconds or an HTTP-date (RFC 9110).
 */
const getRateLimitPauseInMs = (retryAfter, now = Date.now()) => {
  let pauseInMs = null;
  if (typeof retryAfter === 'string' && retryAfter.trim() !== '') {
    const retryAfterInSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterInSeconds)) {
      pauseInMs = retryAfterInSeconds * 1000;
    } else {
      const retryAfterDate = Date.parse(retryAfter);
      if (Number.isFinite(retryAfterDate)) {
        pauseInMs = retryAfterDate - now;
      }
    }
  }
  if (pauseInMs === null || pauseInMs <= 0) {
    return ENEDIS_RATE_LIMITED_DEFAULT_PAUSE_IN_MS;
  }
  return Math.min(pauseInMs, ENEDIS_RATE_LIMITED_MAX_PAUSE_IN_MS);
};

/**
 * Wraps the Enedis job handler: when Enedis answers 429 (quota exceeded), the whole queue
 * is paused and the job goes back to wait without consuming one of its attempts,
 * instead of burning its retries while the quota is still exceeded.
 */
const createEnedisJobProcessor = (logger, enedisModel) => async (job) => {
  try {
    return await enedisModel.enedisSyncData(job);
  } catch (e) {
    if (get(e, 'response.status') !== 429) {
      throw e;
    }
    const headers = get(e, 'response.headers') || {};
    const pauseInMs = getRateLimitPauseInMs(headers['retry-after']);
    logger.warn(`Enedis: quota exceeded (429) on job ${job.name}, pausing the queue for ${pauseInMs / 1000}s`);
    await enedisModel.queue.rateLimit(pauseInMs);
    throw Worker.RateLimitError();
  }
};

const initEnedisListener = async () => {
  const logger = tracer.colorConsole({
    level: process.env.LOG_LEVEL || 'debug',
  });

  // Init database
  const dbOptions = {
    host: process.env.POSTGRESQL_HOST,
    port: process.env.POSTGRESQL_PORT,
    database: process.env.POSTGRESQL_DATABASE,
    user: process.env.POSTGRESQL_USER,
    password: process.env.POSTGRESQL_PASSWORD,
  };

  if (process.env.POSTGRESQL_SSL) {
    dbOptions.ssl = {
      rejectUnauthorized: false,
    };
  }

  const db = await massive(dbOptions);
  // Init Redis
  const redisClient = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    },
    password: process.env.REDIS_PASSWORD,
  });
  // Connect Redis clients
  await redisClient.connect();
  await redisClient.ping();
  // Init Enedis model
  const enedisModel = EnedisModel(logger, db, redisClient);
  const worker = new Worker(ENEDIS_WORKER_KEY, createEnedisJobProcessor(logger, enedisModel), {
    concurrency: 1,
    limiter: ENEDIS_WORKER_LIMITER,
    connection: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
    },
  });
  const shutdown = async () => {
    await worker.close();
  };
  process.on('SIGINT', shutdown);
  logger.info(`Enedis worker: listening!`);
  return {
    db,
    enedisModel,
    worker,
    shutdown,
  };
};

module.exports = {
  initEnedisListener,
  createEnedisJobProcessor,
  getRateLimitPauseInMs,
};
