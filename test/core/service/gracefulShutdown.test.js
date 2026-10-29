const { expect } = require('chai');

const GracefulShutdown = require('../../../core/service/gracefulShutdown');

const silentLogger = { info() {}, warn() {}, error() {} };

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function fakeSocket(id, events) {
  return {
    id,
    // the engine.io connection: closing it is what makes the client reconnect
    conn: {
      close() {
        events.push({ type: 'socket.conn.close', id, at: Date.now() });
      },
    },
    disconnect() {
      events.push({ type: 'socket.disconnect', id, at: Date.now() });
    },
  };
}

function fakeDeps({ socketsCount = 0, serverCloses = true, events = [] } = {}) {
  const sockets = new Map();
  for (let i = 0; i < socketsCount; i += 1) {
    sockets.set(`socket-${i}`, fakeSocket(`socket-${i}`, events));
  }
  const server = {
    close(callback) {
      events.push({ type: 'server.close' });
      if (serverCloses) {
        setTimeout(callback, 5);
      }
    },
    closeAllConnections() {
      events.push({ type: 'server.closeAllConnections' });
    },
  };
  const io = {
    of: () => ({ sockets }),
    close() {
      events.push({ type: 'io.close' });
    },
  };
  let draining = false;
  const lifecycle = {
    startDraining: () => {
      events.push({ type: 'lifecycle.startDraining' });
      draining = true;
    },
    isDraining: () => draining,
  };
  const scheduler = {
    stop() {
      events.push({ type: 'scheduler.stop' });
    },
  };
  const closeConnections = async () => {
    events.push({ type: 'closeConnections' });
  };
  return { events, server, io, lifecycle, scheduler, closeConnections };
}

const FAST = { drainDelayInMs: 10, disconnectWindowInMs: 40, disconnectBatchIntervalInMs: 10, requestsTimeoutInMs: 50 };

describe('graceful shutdown', () => {
  it('should drain, close the server, the websockets, the adapter and the connections, in this order', async () => {
    const deps = fakeDeps({ socketsCount: 3 });
    const { shutdown } = GracefulShutdown(silentLogger, deps, FAST);
    await shutdown('SIGTERM');
    const types = deps.events.map((event) => event.type);
    expect(types).to.deep.equal([
      'lifecycle.startDraining',
      'scheduler.stop',
      'server.close',
      'socket.conn.close',
      'socket.conn.close',
      'socket.conn.close',
      'io.close',
      'closeConnections',
    ]);
    expect(deps.lifecycle.isDraining()).to.equal(true);
    // never socket.disconnect(): its "io server disconnect" is not retried by the clients
    expect(types).to.not.include('socket.disconnect');
  });

  it('should keep accepting traffic during the drain delay', async () => {
    const deps = fakeDeps();
    const { shutdown } = GracefulShutdown(silentLogger, deps, { ...FAST, drainDelayInMs: 60 });
    const done = shutdown('SIGTERM');
    await sleep(20);
    expect(deps.lifecycle.isDraining()).to.equal(true);
    expect(deps.events.map((event) => event.type)).to.not.include('server.close');
    await done;
    expect(deps.events.map((event) => event.type)).to.include('server.close');
  });

  it('should close the websockets by batches spread over the disconnect window', async () => {
    const deps = fakeDeps({ socketsCount: 100 });
    const { shutdown } = GracefulShutdown(silentLogger, deps, {
      ...FAST,
      disconnectWindowInMs: 100,
      disconnectBatchIntervalInMs: 25,
      minDisconnectBatchSize: 10,
    });
    await shutdown('SIGTERM');
    const disconnects = deps.events.filter((event) => event.type === 'socket.conn.close');
    expect(disconnects).to.have.lengthOf(100);
    // 100 sockets over 4 batches of 25, spread over the window
    const spread = disconnects[99].at - disconnects[0].at;
    expect(spread).to.be.at.least(60);
    const batches = new Set(disconnects.map((event) => event.at));
    expect(batches.size).to.be.at.least(4);
  });

  it('should close small deployments without waiting for the whole window', async () => {
    const deps = fakeDeps({ socketsCount: 20 });
    const { shutdown } = GracefulShutdown(silentLogger, deps, {
      ...FAST,
      disconnectWindowInMs: 2000,
      disconnectBatchIntervalInMs: 500,
      minDisconnectBatchSize: 25,
    });
    const startedAt = Date.now();
    await shutdown('SIGTERM');
    // 20 sockets fit in one batch of 25: no 500 ms pause between batches
    expect(Date.now() - startedAt).to.be.below(400);
  });

  it('should destroy the in-flight requests still running after the requests timeout', async () => {
    const deps = fakeDeps({ serverCloses: false });
    const { shutdown } = GracefulShutdown(silentLogger, deps, { ...FAST, requestsTimeoutInMs: 30 });
    await shutdown('SIGTERM');
    const types = deps.events.map((event) => event.type);
    expect(types).to.include('server.closeAllConnections');
    expect(types.indexOf('server.closeAllConnections')).to.be.below(types.indexOf('io.close'));
  });

  it('should not destroy the connections when the server closes in time', async () => {
    const deps = fakeDeps();
    const { shutdown } = GracefulShutdown(silentLogger, deps, FAST);
    await shutdown('SIGTERM');
    expect(deps.events.map((event) => event.type)).to.not.include('server.closeAllConnections');
  });

  it('should run only once when the signal is received twice', async () => {
    const deps = fakeDeps({ socketsCount: 2 });
    const { shutdown } = GracefulShutdown(silentLogger, deps, FAST);
    const first = shutdown('SIGTERM');
    const second = shutdown('SIGINT');
    expect(second).to.equal(first);
    await first;
    expect(deps.events.filter((event) => event.type === 'scheduler.stop')).to.have.lengthOf(1);
    expect(deps.events.filter((event) => event.type === 'closeConnections')).to.have.lengthOf(1);
  });

  it('should reject when the connections cannot be closed', async () => {
    const deps = fakeDeps();
    deps.closeConnections = async () => {
      throw new Error('redis is gone');
    };
    const { shutdown } = GracefulShutdown(silentLogger, deps, FAST);
    await expect(shutdown('SIGTERM')).to.be.rejectedWith('redis is gone');
  });

  it('should expose the options it runs with', () => {
    const deps = fakeDeps();
    const { config } = GracefulShutdown(silentLogger, deps, { drainDelayInMs: 1 });
    expect(config.drainDelayInMs).to.equal(1);
    expect(config.disconnectWindowInMs).to.equal(30000);
  });
});
