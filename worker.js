require('dotenv').config();

const { initEnedisListener } = require('./core/enedis/enedisListener');

const SHUTDOWN_TIMEOUT_IN_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_IN_MS || '115000', 10);

(async () => {
  const { shutdown, closeConnections } = await initEnedisListener();

  // docker stop sends SIGTERM: finish the running job, then leave
  let shuttingDown = false;
  const onSignal = async (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`Enedis worker: ${signal} received, waiting for the running job`);
    setTimeout(() => {
      console.error(`Enedis worker: not finished after ${SHUTDOWN_TIMEOUT_IN_MS}ms, exiting`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_IN_MS).unref();
    try {
      await shutdown();
      await closeConnections();
      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
})();
