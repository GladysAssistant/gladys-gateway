const CONSTANTS = {
  ENEDIS_WORKER_KEY: 'enedis-sync-data',
  ENEDIS_GET_DAILY_CONSUMPTION_JOB_KEY: 'daily-consumption',
  ENEDIS_GET_CONSUMPTION_LOAD_CURVE_JOB_KEY: 'consumption-load-curve',
  ENEDIS_REFRESH_ALL_DATA_JOB_KEY: 'refresh-all-data',
  ENEDIS_DAILY_REFRESH_ALL_USERS_JOB_KEY: 'daily-refresh-all-users',
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
