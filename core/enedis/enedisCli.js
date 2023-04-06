require('dotenv').config();

const tracer = require('tracer');
const Promise = require('bluebird');
const { Queue } = require('bullmq');

const { ENEDIS_WORKER_KEY, ENEDIS_REFRESH_ALL_DATA_JOB_KEY } = require('./enedis.constants');

const logger = tracer.colorConsole({
  level: process.env.LOG_LEVEL || 'debug',
});

const initCli = async () => {
  const action = process.argv[2];
  if (action !== 'refresh_all') {
    logger.warn(`Unknown action ${action}`);
    return;
  }
  if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
    logger.warn(`Missing Redis parameters`);
    return;
  }
  const userId = process.argv[3];
  const queue = new Queue(ENEDIS_WORKER_KEY, {
    connection: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
    },
  });
  logger.info(`Publishing refresh all job for user ${userId}`);
  await queue.add(ENEDIS_REFRESH_ALL_DATA_JOB_KEY, { userId });
  await Promise.delay(1000);
  logger.info(`Done! Exiting.`);
  process.exit(0);
};

initCli();
