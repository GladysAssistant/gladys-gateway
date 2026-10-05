const CONSTANTS = {
  ENEDIS_WORKER_KEY: 'enedis-sync-data',
  ENEDIS_GET_DAILY_CONSUMPTION_JOB_KEY: 'daily-consumption',
  ENEDIS_GET_CONSUMPTION_LOAD_CURVE_JOB_KEY: 'consumption-load-curve',
  ENEDIS_REFRESH_ALL_DATA_JOB_KEY: 'refresh-all-data',
  ENEDIS_DAILY_REFRESH_ALL_USERS_JOB_KEY: 'daily-refresh-all-users',
  // Enedis allows each application 5 calls per second and 1000 calls per hour per API
  // (a 429 means "L'application a dépassé son quota d'appels"). Every call to Enedis is made
  // from a job of this queue, and a job calls a given API about once, so one job every
  // 4 seconds (900 jobs per hour) stays under both quotas. BullMQ applies the limiter
  // to the whole queue, whatever the number of worker replicas.
  ENEDIS_WORKER_LIMITER: {
    max: 1,
    duration: 4 * 1000,
  },
  // A job refreshing an account with several usage points makes one contract call per
  // usage point: they are spaced to stay under 5 calls per second.
  ENEDIS_DELAY_BETWEEN_CONTRACT_CALLS_IN_MS: 250,
  // When Enedis answers 429 anyway, the queue is paused for the Retry-After delay (bounded,
  // the quota being hourly), or for the default pause when Enedis does not send a usable one.
  ENEDIS_RATE_LIMITED_DEFAULT_PAUSE_IN_MS: 10 * 60 * 1000,
  ENEDIS_RATE_LIMITED_MAX_PAUSE_IN_MS: 60 * 60 * 1000,
  BULLMQ_PUBLISH_JOB_OPTIONS: {
    removeOnComplete: {
      age: 24 * 60 * 60, // Keep 24 hours
      count: 1000, // keep up to 1000 jobs
    },
    removeOnFail: {
      age: 10 * 24 * 60 * 60, // keep up to 10 days
    },
    attempts: 5, // Retry 5 times
    backoff: {
      type: 'exponential',
      delay: 15 * 1000, // 15, 30 sec, 1 min, 2 min, 4 min
    },
  },
};

module.exports = CONSTANTS;
