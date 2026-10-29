require('dotenv').config();
// Sentry must be initialized before Express / http are loaded
require('./core/service/sentry').init();
const DBMigrate = require('db-migrate');
const server = require('./core/index');
const { readPositiveIntegerEnv } = require('./core/common/env');

// The whole shutdown (drain, websockets closed by batches, in-flight requests)
// must fit in the stop grace period of the container (deploy/docker-compose.yml)
// an invalid value falls back to the default rather than exiting at once on SIGTERM
const SHUTDOWN_TIMEOUT_IN_MS = readPositiveIntegerEnv('SHUTDOWN_TIMEOUT_IN_MS', 55000);

(async () => {
  // we perform database migration if needed
  const dbmigrate = DBMigrate.getInstance(true, {
    env: process.env.NODE_ENV === 'production' ? 'production' : 'dev',
  });
  await dbmigrate.up();
  // then, we start server
  const { shutdown } = await server(process.env.SERVER_PORT);

  // docker stop sends SIGTERM: drain the node without cutting anyone off
  // (see core/service/gracefulShutdown.js and deploy/README.md)
  const onSignal = (signal) => {
    setTimeout(() => {
      console.error(`shutdown: not finished after ${SHUTDOWN_TIMEOUT_IN_MS}ms, exiting`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_IN_MS).unref();
    shutdown(signal).then(
      () => process.exit(0),
      (e) => {
        console.error(e);
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
})();
