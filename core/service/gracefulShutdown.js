const DEFAULT_OPTIONS = {
  // Time left to the proxy / load balancer to see /ping answering 503 before
  // the server stops accepting connections
  drainDelayInMs: 5000,
  // The websockets are closed by batches spread over this window, so that the
  // instances and the dashboards do not all reconnect to the other node at once
  disconnectWindowInMs: 30000,
  disconnectBatchIntervalInMs: 500,
  minDisconnectBatchSize: 25,
  // In-flight HTTP requests get this long to finish, then their connections are destroyed
  requestsTimeoutInMs: 15000,
};

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Stops the server without cutting anyone off, when the container is stopped
 * (docker stop sends SIGTERM, see deploy/README.md for the blue/green switch):
 *
 * 1. /ping answers 503 and the scheduled jobs stop, so that a load balancer
 *    checking /ping stops sending new traffic here (drainDelayInMs).
 * 2. The HTTP server stops accepting connections and closes the idle keep-alive ones.
 * 3. The websockets are closed by batches: the clients see a transport close and
 *    reconnect by themselves (to the other node, through the proxy / load balancer).
 * 4. The in-flight HTTP requests finish (requestsTimeoutInMs at most).
 * 5. The socket.io adapter, Redis and Postgres connections are closed.
 *
 * Calling shutdown() twice returns the same promise: a second signal does not
 * start a second shutdown.
 */
module.exports = function GracefulShutdown(
  logger,
  { server, io, scheduler, lifecycle, closeConnections },
  options = {},
) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let shutdownPromise = null;

  /**
   * Stops accepting connections and resolves when every connection is closed,
   * or when the in-flight requests have had their time and were destroyed.
   */
  function closeServer() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (how) => {
        if (!done) {
          done = true;
          resolve(how);
        }
      };
      const timer = setTimeout(() => {
        server.closeAllConnections();
        finish('forced');
      }, config.requestsTimeoutInMs);
      server.close(() => {
        clearTimeout(timer);
        finish('clean');
      });
    });
  }

  /**
   * Closes the websockets by batches, at the transport level (socket.conn is the
   * engine.io connection): the client sees a "transport close" and reconnects on
   * its own. socket.disconnect() would send a socket.io disconnect packet instead,
   * an "io server disconnect" that socket.io clients never retry.
   */
  async function disconnectSockets() {
    const sockets = Array.from(io.of('/').sockets.values());
    if (sockets.length === 0) {
      return 0;
    }
    const batches = Math.max(1, Math.floor(config.disconnectWindowInMs / config.disconnectBatchIntervalInMs));
    const batchSize = Math.max(config.minDisconnectBatchSize, Math.ceil(sockets.length / batches));
    for (let i = 0; i < sockets.length; i += batchSize) {
      if (i > 0) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(config.disconnectBatchIntervalInMs);
      }
      sockets.slice(i, i + batchSize).forEach((socket) => socket.conn.close());
    }
    return sockets.length;
  }

  function shutdown(signal = 'SIGTERM') {
    if (shutdownPromise) {
      logger.warn(`shutdown: ${signal} received while already shutting down, ignored`);
      return shutdownPromise;
    }
    const startedAt = Date.now();
    shutdownPromise = (async () => {
      logger.info(`shutdown: ${signal} received, draining (/ping answers 503 from now on)`);
      lifecycle.startDraining();
      scheduler.stop();
      await sleep(config.drainDelayInMs);
      logger.info('shutdown: closing the server and the websockets');
      const serverClosed = closeServer();
      const disconnected = await disconnectSockets();
      logger.info(`shutdown: ${disconnected} websocket(s) closed, waiting for the in-flight requests`);
      const how = await serverClosed;
      if (how === 'forced') {
        logger.warn(`shutdown: in-flight requests still running after ${config.requestsTimeoutInMs}ms, destroyed`);
      }
      // closes the remaining sockets and the adapter (unsubscribes from Redis)
      io.close();
      await closeConnections();
      logger.info(`shutdown: done in ${Date.now() - startedAt}ms`);
    })();
    return shutdownPromise;
  }

  return {
    shutdown,
    config,
  };
};
