const { expect } = require('chai');
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');

const server = require('../../../core/index');

const SHUTDOWN_ENV = {
  SHUTDOWN_DRAIN_DELAY_IN_MS: '300',
  SHUTDOWN_DISCONNECT_WINDOW_IN_MS: '500',
  SHUTDOWN_REQUESTS_TIMEOUT_IN_MS: '1000',
};

const waitFor = (emitter, event) =>
  new Promise((resolve) => {
    emitter.once(event, resolve);
  });

describe('graceful shutdown of a real server', function Describe() {
  this.timeout(15000);
  const previousEnv = {};

  before(() => {
    Object.keys(SHUTDOWN_ENV).forEach((name) => {
      previousEnv[name] = process.env[name];
      process.env[name] = SHUTDOWN_ENV[name];
    });
  });

  after(() => {
    Object.keys(SHUTDOWN_ENV).forEach((name) => {
      if (previousEnv[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previousEnv[name];
      }
    });
  });

  it('should answer 503 on /ping, close the websockets so that the clients reconnect, and close everything', async () => {
    // a third backend, next to the two of the test bootstrap, that this test can stop
    const port = parseInt(process.env.SERVER_PORT, 10) + 2;
    const backend = await server(port);
    const client = ioClient(`http://127.0.0.1:${port}`, { reconnectionDelay: 100, reconnectionDelayMax: 100 });
    try {
      await waitFor(client, 'connect');
      await request(backend.app).get('/ping').expect(200);

      const disconnected = waitFor(client, 'disconnect');
      const reconnecting = waitFor(client.io, 'reconnect_attempt');
      const done = backend.shutdown('SIGTERM');

      // draining: the health check fails at once, before any connection is closed
      expect(backend.lifecycle.isDraining()).to.equal(true);
      const drained = await request(backend.app).get('/ping').expect(503);
      expect(drained.body).to.deep.equal({ status: 503, draining: true });
      expect(client.connected).to.equal(true);

      // the websocket is closed at the transport level: the client retries by itself
      expect(await disconnected).to.equal('transport close');
      await reconnecting;

      await done;
      await expect(backend.redisClient.ping()).to.be.rejected;
      expect(backend.server.listening).to.equal(false);
    } finally {
      client.close();
    }
  });
});
