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
 * 4. The in-flight HTTP requests finish (requestsTimeoutInMs at most, counted from
 *    the end of the batches: the steps are sequential, their sum must fit in the
 *    stop grace period of the container).
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
   * Resolves once every connection is closed ("clean"), or once the in-flight
   * requests have had requestsTimeoutInMs after the websockets were closed and
   * were destroyed ("forced"). The timer only starts when waitForRequests is
   * called, after the websockets batches: server.close() cannot complete while
   * websockets are open, so a timer started earlier would cut the in-flight
   * requests short.
   */
  function waitForRequests(serverClosed) {
    let timer;
    const forced = new Promise((resolve) => {
      timer = setTimeout(() => {
        server.closeAllConnections();
        resolve('forced');
      }, config.requestsTimeoutInMs);
    });
    return Promise.race([serverClosed, forced]).then((how) => {
      clearTimeout(timer);
      return how;
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
      // no new connection from now on; the callback fires once every connection is gone
      const serverClosed = new Promise((resolve) => {
        server.close(() => resolve('clean'));
      });
      server.closeIdleConnections();
      const disconnected = await disconnectSockets();
      logger.info(`shutdown: ${disconnected} websocket(s) closed, waiting for the in-flight requests`);
      const how = await waitForRequests(serverClosed);
      if (how === 'forced') {
        logger.warn(`shutdown: in-flight requests still running after ${config.requestsTimeoutInMs}ms, destroyed`);
      }
      // closes the remaining sockets and the adapter (unsubscribes from Redis). Async in
      // socket.io 4: awaited so that Redis is still there while the adapter unsubscribes.
      // Its second httpServer.close() is harmless (the error only reaches its callback).
      await io.close();
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
