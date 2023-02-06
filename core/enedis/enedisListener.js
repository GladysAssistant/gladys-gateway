const tracer = require('tracer');
const redis = require('redis');
const massive = require('massive');
const { Worker } = require('bullmq');

const EnedisModel = require('./enedis');
const { ENEDIS_WORKER_KEY } = require('./enedis.constants');

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
  const worker = new Worker(ENEDIS_WORKER_KEY, enedisModel.enedisSyncData, {
    concurrency: 1,
    limiter: {
      max: 2,
      duration: 1000,
    },
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
};
