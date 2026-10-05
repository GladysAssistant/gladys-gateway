const { io } = require('socket.io-client');
const request = require('supertest');
const { expect } = require('chai');
const Jwt = require('../../../../core/service/jwt');

const INSTANCE_ID = '0bc53f3c-1e11-40d3-99a4-bd392a666eaf';
const ACCOUNT_ID = 'b2d23f66-487d-493f-8acb-9c8adb400def';
const USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
// instance of another account, inserted by the tests needing a second connected instance
const OTHER_INSTANCE_ID = '7f3c9d2a-5b1e-4c8f-9a6d-2e4b8c1f0a3d';
const OTHER_ACCOUNT_ID = 'be2b9666-5c72-451e-98f4-efca76ffef54';
const OPEN_API_KEY = '01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db';
const PRIMARY_INSTANCE_CACHE_KEY = `primary_instance_per_user:${USER_ID}`;

const INSTANCE_TIMEOUT_RESPONSE = { status: 504, error_code: 'GATEWAY_TIMEOUT', error_message: 'INSTANCE_TIMEOUT' };
const NO_INSTANCE_FOUND_RESPONSE = { status: 404, error_code: 'NOT_FOUND', error_message: 'NO_INSTANCE_FOUND' };

describe('socket message routing', function Describe() {
  this.timeout(5000);

  const jwt = Jwt();
  const sockets = [];

  function connect(port, auth, authenticatedEvent) {
    const socket = io(`http://localhost:${port}`, { auth });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.on(authenticatedEvent, () => resolve(socket));
      // fail with the reason instead of waiting for the timeout of the test
      socket.on(`${auth.auth_type}-authentication-failed`, ({ reason }) =>
        reject(new Error(`${auth.auth_type} authentication failed: ${reason}`)),
      );
      socket.on('connect_error', reject);
    });
  }

  // deep enough to overflow the stack when emitted, shallow enough to be decoded
  const DEEPLY_NESTED = `${'['.repeat(20000)}${']'.repeat(20000)}`;

  // Sends an event written by hand: socket.io-client cannot encode a payload nested so deeply
  // that its recursive binary check overflows the stack, the server must survive receiving it
  function sendDeeplyNestedEvent(socket, event, fields) {
    socket.io.engine.send(`2["${event}",{${fields},"data":${DEEPLY_NESTED}}]`);
  }

  // An instance acknowledging the next message it receives with a deeply nested payload,
  // written by hand from the id of the ack in the raw packet
  function acknowledgeNextMessageDeeplyNested(socket) {
    socket.io.engine.on('packet', (packet) => {
      const match = typeof packet.data === 'string' && packet.data.match(/^2(\d+)\["(open-api-)?message"/);
      if (match) {
        socket.io.engine.send(`3${match[1]}[{"data":${DEEPLY_NESTED}}]`);
      }
    });
  }

  const INVALID_INSTANCE_RESPONSE = {
    status: 502,
    error_code: 'BAD_GATEWAY',
    error_message: 'INVALID_INSTANCE_RESPONSE',
  };

  const lastInstanceSocketKey = (instanceId = INSTANCE_ID) => `instance_socket:${instanceId}`;

  function connectInstance(port = process.env.SERVER_PORT, instanceId = INSTANCE_ID) {
    return connect(
      port,
      { auth_type: 'instance', access_token: jwt.generateAccessTokenInstance({ id: instanceId }) },
      'instance-authenticated',
    );
  }

  function connectUser(port = process.env.SERVER_PORT, userId = USER_ID) {
    return connect(
      port,
      {
        auth_type: 'user',
        access_token: jwt.generateAccessToken({ id: userId }, ['dashboard:read', 'dashboard:write']),
      },
      'user-authenticated',
    );
  }

  function sendMessage(socketUser, message) {
    return new Promise((resolve) => {
      socketUser.emit('message', message, resolve);
    });
  }

  afterEach(() => {
    delete process.env.INSTANCE_MESSAGE_TIMEOUT_IN_MS;
    delete process.env.INSTANCE_OPEN_API_MESSAGE_TIMEOUT_IN_MS;
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  describe('timeout', () => {
    beforeEach(() => {
      process.env.INSTANCE_MESSAGE_TIMEOUT_IN_MS = '200';
      process.env.INSTANCE_OPEN_API_MESSAGE_TIMEOUT_IN_MS = '200';
    });

    it('should answer a timeout when the instance, on the same node, never acknowledges the message', async () => {
      const socketInstance = await connectInstance();
      // an instance whose handler crashed: the message is received, never acknowledged
      socketInstance.on('message', () => {});
      const socketUser = await connectUser();

      const response = await sendMessage(socketUser, { data: 'test-data', instance_id: INSTANCE_ID });
      expect(response).to.deep.equal(INSTANCE_TIMEOUT_RESPONSE);
    });

    it('should answer a timeout when the instance, on another node, never acknowledges the message', async () => {
      const socketInstance = await connectInstance(process.env.SERVER_PORT + 1);
      socketInstance.on('message', () => {});
      const socketUser = await connectUser(process.env.SERVER_PORT);

      const response = await sendMessage(socketUser, { data: 'test-data', instance_id: INSTANCE_ID });
      expect(response).to.deep.equal(INSTANCE_TIMEOUT_RESPONSE);
    });

    it('should answer once when the instance disconnects before its timeout', async () => {
      const socketInstance = await connectInstance();
      socketInstance.on('message', () => socketInstance.disconnect());
      const socketUser = await connectUser();
      const responses = [];
      socketUser.emit('message', { data: 'test-data', instance_id: INSTANCE_ID }, (response) =>
        responses.push(response),
      );

      // the timeout (200 ms) fires after the disconnection already answered
      await new Promise((resolve) => {
        setTimeout(resolve, 400);
      });
      expect(responses).to.deep.equal([NO_INSTANCE_FOUND_RESPONSE]);
    });

    it('should answer 504 to an Open API call the instance never acknowledges', async () => {
      const socketInstance = await connectInstance();
      let openApiMessagesReceived = 0;
      socketInstance.on('open-api-message', () => {
        openApiMessagesReceived += 1;
      });

      const response = await request(TEST_BACKEND_APP)
        .post(`/v1/api/event/${OPEN_API_KEY}`)
        .send({ name: 'my-event' })
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(504);

      expect(response.body).to.deep.equal(INSTANCE_TIMEOUT_RESPONSE);
      expect(openApiMessagesReceived).to.equal(1);
    });
  });

  it('should answer NO_INSTANCE_FOUND when the instance is not connected', async () => {
    const socketUser = await connectUser();

    const response = await sendMessage(socketUser, { data: 'test-data', instance_id: INSTANCE_ID });
    expect(response).to.deep.equal(NO_INSTANCE_FOUND_RESPONSE);
  });

  it('should answer NO_INSTANCE_FOUND to an invalid message, and survive a message sent without ack', async () => {
    const socketUser = await connectUser();

    expect(await sendMessage(socketUser, null)).to.deep.equal(NO_INSTANCE_FOUND_RESPONSE);
    expect(await sendMessage(socketUser, { data: 'test-data' })).to.deep.equal(NO_INSTANCE_FOUND_RESPONSE);

    // nobody to answer to: the server must not throw
    socketUser.emit('message', { data: 'test-data', instance_id: INSTANCE_ID });
    socketUser.emit('message', 'not-an-object');
    const latency = await new Promise((resolve) => {
      socketUser.emit('latency', Date.now(), resolve);
    });
    expect(latency).to.be.greaterThan(0);
  });

  it('should relay a message to the last connection of an instance connected twice', async () => {
    // the previous connection of the instance, not detected as dead yet by the server
    const previousSocketInstance = await connectInstance();
    let messagesReceivedByPreviousConnection = 0;
    previousSocketInstance.on('message', () => {
      messagesReceivedByPreviousConnection += 1;
    });
    const socketInstance = await connectInstance();
    socketInstance.on('message', (data, cb) => cb({ response: 'response' }));
    const socketUser = await connectUser();

    const response = await sendMessage(socketUser, { data: 'test-data', instance_id: INSTANCE_ID });
    expect(response).to.deep.equal({ response: 'response' });
    expect(messagesReceivedByPreviousConnection).to.equal(0);
  });

  it('should return an empty acknowledgement of an instance on another node, not NO_INSTANCE_FOUND', async () => {
    const socketInstance = await connectInstance(process.env.SERVER_PORT + 1);
    socketInstance.on('message', (data, cb) => cb());
    const socketUser = await connectUser(process.env.SERVER_PORT);

    const response = await sendMessage(socketUser, { data: 'test-data', instance_id: INSTANCE_ID });
    expect(response).to.equal(null);
  });

  it('should relay a request from another node only once when the last socket of the instance is unknown', async () => {
    const socketInstance = await connectInstance(process.env.SERVER_PORT + 1);
    // the last socket expired: the first node to claim the request relays it
    await TEST_REDIS_CLIENT.del(lastInstanceSocketKey());
    let messagesReceivedByInstance = 0;
    socketInstance.on('message', (data, cb) => {
      messagesReceivedByInstance += 1;
      cb({ response: 'response' });
    });
    // the same request reaching the node twice, as it would reach two nodes holding the instance
    const relayRequest = {
      request_id: 'a8a4b0e2-3f5c-4c55-9d0f-2b0e7d0c9e11',
      room: `account:${ACCOUNT_ID}:instance:${INSTANCE_ID}`,
      message: { data: 'test-data', instance_id: INSTANCE_ID },
    };
    const relay = () =>
      new Promise((resolve) => {
        TEST_IO.serverSideEmit('find-socket-and-send-message', relayRequest, (err, replies) => resolve(replies));
      });

    expect(await relay()).to.deep.equal([{ found: true, response: { response: 'response' } }]);
    expect(await relay()).to.deep.equal([null]);
    expect(messagesReceivedByInstance).to.equal(1);
  });

  it('should only relay a request from another node on the last connection of the instance', async () => {
    // the instance lost its connection to the first node and reconnected to the second one,
    // before the first node noticed the previous connection was dead
    const previousSocketInstance = await connectInstance(process.env.SERVER_PORT);
    let messagesReceivedByPreviousConnection = 0;
    previousSocketInstance.on('message', () => {
      messagesReceivedByPreviousConnection += 1;
    });
    const socketInstance = await connectInstance(process.env.SERVER_PORT + 1);
    socketInstance.on('message', (data, cb) => cb({ response: 'response' }));
    expect(await TEST_REDIS_CLIENT.get(lastInstanceSocketKey())).to.equal(socketInstance.id);

    // the request of a third node reaches both nodes
    const relayRequest = {
      request_id: '0e6f1d3c-8a7b-4c2d-9e1f-3a4b5c6d7e8f',
      room: `account:${ACCOUNT_ID}:instance:${INSTANCE_ID}`,
      message: { data: 'test-data', instance_id: INSTANCE_ID },
    };
    const relayFrom = (server) =>
      new Promise((resolve) => {
        server.serverSideEmit('find-socket-and-send-message', relayRequest, (err, replies) => resolve(replies));
      });

    // handled by the first node, holding the previous connection
    expect(await relayFrom(TEST_IO_SERVER_2)).to.deep.equal([null]);
    // handled by the second node, holding the last connection
    expect(await relayFrom(TEST_IO)).to.deep.equal([{ found: true, response: { response: 'response' } }]);
    expect(messagesReceivedByPreviousConnection).to.equal(0);
  });

  it('should forget the last socket of an instance when it disconnects, unless a newer one replaced it', async () => {
    const previousSocketInstance = await connectInstance();
    const socketInstance = await connectInstance();

    previousSocketInstance.disconnect();
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(await TEST_REDIS_CLIENT.get(lastInstanceSocketKey())).to.equal(socketInstance.id);

    socketInstance.disconnect();
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(await TEST_REDIS_CLIENT.get(lastInstanceSocketKey())).to.equal(null);
  });

  it('should answer at once when the instance disconnects before acknowledging the message', async () => {
    const socketInstance = await connectInstance();
    // the Raspberry Pi reboots while handling the message
    socketInstance.on('message', () => socketInstance.disconnect());
    const socketUser = await connectUser();

    // the default timeout is 5 minutes, far longer than the timeout of this test
    const response = await sendMessage(socketUser, { data: 'test-data', instance_id: INSTANCE_ID });
    expect(response).to.deep.equal(NO_INSTANCE_FOUND_RESPONSE);
  });

  it('should answer an error when the answer of the instance is too deeply nested to be sent on', async () => {
    const socketInstance = await connectInstance();
    acknowledgeNextMessageDeeplyNested(socketInstance);
    const socketUser = await connectUser();

    const response = await sendMessage(socketUser, { data: 'test-data', instance_id: INSTANCE_ID });
    expect(response).to.deep.equal(INVALID_INSTANCE_RESPONSE);
  });

  it('should survive an answer too deeply nested to be relayed across nodes', async () => {
    const originalRequestsTimeout = TEST_IO.of('/').adapter.requestsTimeout;
    TEST_IO.of('/').adapter.requestsTimeout = 300;
    try {
      const socketInstance = await connectInstance(process.env.SERVER_PORT + 1);
      acknowledgeNextMessageDeeplyNested(socketInstance);
      const socketUser = await connectUser(process.env.SERVER_PORT);

      // the node holding the instance cannot serialize its answer: the origin times out
      const response = await sendMessage(socketUser, { data: 'test-data', instance_id: INSTANCE_ID });
      expect(response).to.deep.equal(INSTANCE_TIMEOUT_RESPONSE);
    } finally {
      TEST_IO.of('/').adapter.requestsTimeout = originalRequestsTimeout;
    }
  });

  it('should not wait on the relaying node longer than the origin waits for the cluster', async () => {
    const originalRequestsTimeout = TEST_IO.of('/').adapter.requestsTimeout;
    // this node relays, and its requestsTimeout is the one of the whole cluster
    TEST_IO.of('/').adapter.requestsTimeout = 200;
    try {
      const socketInstance = await connectInstance(process.env.SERVER_PORT);
      socketInstance.on('message', () => {});

      const startedAt = Date.now();
      const replies = await new Promise((resolve) => {
        TEST_IO_SERVER_2.serverSideEmit(
          'find-socket-and-send-message',
          {
            request_id: '9c1b2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e',
            room: `account:${ACCOUNT_ID}:instance:${INSTANCE_ID}`,
            message: { data: 'test-data', instance_id: INSTANCE_ID },
          },
          (err, result) => resolve(result),
        );
      });
      // the dashboard timeout is 5 minutes: the relay gave up after the cluster timeout
      expect(replies).to.deep.equal([{ found: true, response: INSTANCE_TIMEOUT_RESPONSE }]);
      expect(Date.now() - startedAt).to.be.below(2000);
    } finally {
      TEST_IO.of('/').adapter.requestsTimeout = originalRequestsTimeout;
    }
  });

  it('should not relay a message of an instance without a valid user_id', async () => {
    const socketInstance = await connectInstance();
    const socketUser = await connectUser();
    let messagesReceivedByUser = 0;
    socketUser.on('message', () => {
      messagesReceivedByUser += 1;
    });

    socketInstance.emit('message', null);
    socketInstance.emit('message', { data: 'to-nobody' });
    socketInstance.emit('message', { data: 'to-user', user_id: USER_ID });

    await new Promise((resolve) => {
      socketUser.on('message', resolve);
    });
    expect(messagesReceivedByUser).to.equal(1);
  });

  it('should survive messages too deeply nested to be relayed, in both directions', async () => {
    const socketInstance = await connectInstance();
    let messagesReceivedByInstance = 0;
    socketInstance.on('message', () => {
      messagesReceivedByInstance += 1;
    });
    const socketUser = await connectUser();

    sendDeeplyNestedEvent(socketUser, 'message', `"instance_id":"${INSTANCE_ID}"`);
    sendDeeplyNestedEvent(socketInstance, 'message', `"user_id":"${USER_ID}"`);

    // both nodes still answer
    const latencies = await Promise.all(
      [socketUser, socketInstance].map(
        (socket) =>
          new Promise((resolve) => {
            socket.emit('latency', Date.now(), resolve);
          }),
      ),
    );
    latencies.forEach((latency) => expect(latency).to.be.greaterThan(0));
    expect(messagesReceivedByInstance).to.equal(0);
  });

  it('should list the instances connected to every node, and only the instances', async () => {
    await TEST_DATABASE_INSTANCE.t_instance.insert({
      id: OTHER_INSTANCE_ID,
      name: 'Other account instance',
      account_id: OTHER_ACCOUNT_ID,
      rsa_public_key: 'public-key',
      ecdsa_public_key: 'public-key',
    });
    expect(await TEST_MODELS.socketModel.getConnectedInstanceIds()).to.deep.equal(new Set());

    await connectInstance(process.env.SERVER_PORT, INSTANCE_ID);
    await connectInstance(process.env.SERVER_PORT + 1, OTHER_INSTANCE_ID);
    await connectUser(process.env.SERVER_PORT);
    await connectUser(process.env.SERVER_PORT + 1);

    expect(await TEST_MODELS.socketModel.getConnectedInstanceIds()).to.deep.equal(
      new Set([INSTANCE_ID, OTHER_INSTANCE_ID]),
    );
  });

  it('should disconnect every socket of a revoked user, on every node', async () => {
    const revokedUserId = '3b69f1c5-d36c-419d-884c-50b9dd6e33e4';
    const socketsOfRevokedUser = await Promise.all([
      connectUser(process.env.SERVER_PORT, revokedUserId),
      connectUser(process.env.SERVER_PORT + 1, revokedUserId),
    ]);
    const disconnections = socketsOfRevokedUser.map(
      (socket) =>
        new Promise((resolve) => {
          socket.on('disconnect', resolve);
        }),
    );
    const socketOfAnotherUser = await connectUser(process.env.SERVER_PORT + 1);

    await TEST_MODELS.socketModel.disconnectUser(revokedUserId);

    expect(await Promise.all(disconnections)).to.deep.equal(['io server disconnect', 'io server disconnect']);
    expect(socketOfAnotherUser.connected).to.equal(true);
  });

  describe('primary instance', () => {
    const SECONDARY_INSTANCE_ID = 'c9f4e0a3-6a51-4d0e-8f3a-1b2c3d4e5f60';

    it('should not rewrite anything when an instance already primary reconnects', async () => {
      await TEST_REDIS_CLIENT.set(PRIMARY_INSTANCE_CACHE_KEY, INSTANCE_ID);

      await connectInstance();

      const instance = await TEST_DATABASE_INSTANCE.t_instance.findOne({ id: INSTANCE_ID });
      expect(instance).to.have.property('primary_instance', true);
      // the cache is only cleared when the primary instance changes
      expect(await TEST_REDIS_CLIENT.get(PRIMARY_INSTANCE_CACHE_KEY)).to.equal(INSTANCE_ID);
    });

    it('should make a secondary instance primary when it connects, and clear the cache', async () => {
      await TEST_DATABASE_INSTANCE.t_instance.insert({
        id: SECONDARY_INSTANCE_ID,
        name: 'Raspberry Pi 2',
        account_id: ACCOUNT_ID,
        rsa_public_key: 'public-key',
        ecdsa_public_key: 'public-key',
        primary_instance: false,
      });
      await TEST_REDIS_CLIENT.set(PRIMARY_INSTANCE_CACHE_KEY, INSTANCE_ID);

      await connectInstance(process.env.SERVER_PORT, SECONDARY_INSTANCE_ID);

      const instances = await TEST_DATABASE_INSTANCE.t_instance.find(
        { account_id: ACCOUNT_ID },
        { fields: ['id', 'primary_instance'], order: [{ field: 'id' }] },
      );
      expect(instances).to.deep.equal([
        { id: INSTANCE_ID, primary_instance: false },
        { id: SECONDARY_INSTANCE_ID, primary_instance: true },
      ]);
      expect(await TEST_REDIS_CLIENT.get(PRIMARY_INSTANCE_CACHE_KEY)).to.equal(null);
    });
  });

  describe('analytics', () => {
    let analyticsService;
    let originalSendMessageSizeMetric;
    let metrics;

    beforeEach(() => {
      ({ analyticsService } = TEST_SERVICES);
      originalSendMessageSizeMetric = analyticsService.sendMessageSizeMetric;
      metrics = [];
      analyticsService.sendMessageSizeMetric = (type, message) => metrics.push({ type, message });
    });

    afterEach(() => {
      analyticsService.sendMessageSizeMetric = originalSendMessageSizeMetric;
    });

    it('should measure the messages relayed in both directions', async () => {
      const socketInstance = await connectInstance(process.env.SERVER_PORT + 1);
      socketInstance.on('message', (data, cb) => cb({ response: 'response' }));
      const socketUser = await connectUser(process.env.SERVER_PORT);
      const received = new Promise((resolve) => {
        socketUser.on('message', resolve);
      });

      await sendMessage(socketUser, { data: 'test-data', instance_id: INSTANCE_ID });
      // the user is on this node: its message is relayed by this node
      const socketInstanceOnThisNode = await connectInstance(process.env.SERVER_PORT);
      socketInstanceOnThisNode.emit('message', { data: 'to-user', user_id: USER_ID });
      await received;

      expect(metrics.map((metric) => metric.type)).to.deep.equal([
        'message-to-instance',
        'message-to-instance-response',
        'message-to-user',
      ]);
      expect(metrics[1].message).to.deep.equal({ response: 'response' });
    });
  });

  describe('failures', () => {
    const REDIS_METHODS = ['get', 'set', 'del', 'eval'];
    let originalServerSideEmit;
    let originalIn;
    let originalRedisMethods;

    beforeEach(() => {
      originalServerSideEmit = TEST_IO.serverSideEmit;
      originalIn = TEST_IO.in;
      originalRedisMethods = REDIS_METHODS.map((method) => TEST_REDIS_CLIENT[method]);
    });

    afterEach(() => {
      TEST_IO.serverSideEmit = originalServerSideEmit;
      TEST_IO.in = originalIn;
      REDIS_METHODS.forEach((method, index) => {
        TEST_REDIS_CLIENT[method] = originalRedisMethods[index];
      });
    });

    // the Redis adapter never calls back when it could not send the request (Redis down)
    const dropClusterRequests = () => {
      TEST_IO.serverSideEmit = () => {};
      TEST_IO.of('/').adapter.requestsTimeout = 100;
    };

    it('should answer a timeout when the request to the cluster could not be sent', async () => {
      const originalRequestsTimeout = TEST_IO.of('/').adapter.requestsTimeout;
      dropClusterRequests();
      try {
        const socketUser = await connectUser(process.env.SERVER_PORT);

        const response = await sendMessage(socketUser, { data: 'test-data', instance_id: INSTANCE_ID });
        expect(response).to.deep.equal(INSTANCE_TIMEOUT_RESPONSE);
      } finally {
        TEST_IO.of('/').adapter.requestsTimeout = originalRequestsTimeout;
      }
    });

    it('should fail to list the connected instances when the request to the cluster could not be sent', async () => {
      const originalRequestsTimeout = TEST_IO.of('/').adapter.requestsTimeout;
      dropClusterRequests();
      try {
        await expect(TEST_MODELS.socketModel.getConnectedInstanceIds()).to.be.rejectedWith(
          'no answer from the cluster',
        );
      } finally {
        TEST_IO.of('/').adapter.requestsTimeout = originalRequestsTimeout;
      }
    });

    // a node of the cluster that does not answer in time
    const failClusterRequests = () => {
      TEST_IO.serverSideEmit = (event, ...args) => {
        const cb = args[args.length - 1];
        cb(new Error('timeout reached: only 0 responses received out of 1'), []);
      };
    };

    it('should answer a timeout when a node of the cluster does not answer', async () => {
      failClusterRequests();
      const socketUser = await connectUser(process.env.SERVER_PORT);

      const response = await sendMessage(socketUser, { data: 'test-data', instance_id: INSTANCE_ID });
      expect(response).to.deep.equal(INSTANCE_TIMEOUT_RESPONSE);
    });

    it('should fail to list the connected instances when a node of the cluster does not answer', async () => {
      failClusterRequests();

      await expect(TEST_MODELS.socketModel.getConnectedInstanceIds()).to.be.rejectedWith('timeout reached');
    });

    it('should consider a user disconnected when the cluster cannot be asked', async () => {
      TEST_IO.in = () => ({ fetchSockets: () => Promise.reject(new Error('timeout reached')) });

      expect(await TEST_MODELS.socketModel.isUserConnected(USER_ID)).to.equal(false);
    });

    it('should relay a message anyway when Redis cannot tell which node relays it', async () => {
      const socketInstance = await connectInstance(process.env.SERVER_PORT);
      socketInstance.on('message', (data, cb) => cb({ response: 'response' }));
      // neither the last socket of the instance nor the claim of the request can be read
      TEST_REDIS_CLIENT.get = () => Promise.reject(new Error('Redis is down'));
      TEST_REDIS_CLIENT.set = () => Promise.reject(new Error('Redis is down'));

      // the request comes from the other node, it is relayed by this one
      const replies = await new Promise((resolve) => {
        TEST_IO_SERVER_2.serverSideEmit(
          'find-socket-and-send-message',
          {
            request_id: '5d0c7f6e-9b1a-4f3e-8c2d-7a6b5c4d3e2f',
            room: `account:${ACCOUNT_ID}:instance:${INSTANCE_ID}`,
            message: { data: 'test-data', instance_id: INSTANCE_ID },
          },
          (err, result) => resolve(result),
        );
      });
      expect(replies).to.deep.equal([{ found: true, response: { response: 'response' } }]);
    });

    it('should not record as last socket a socket that closed while the instance authenticated', async () => {
      await TEST_REDIS_CLIENT.set(lastInstanceSocketKey(), 'previous-socket-id');

      await TEST_MODELS.socketModel.setLastInstanceSocket(INSTANCE_ID, { id: 'closed-socket-id', disconnected: true });

      expect(await TEST_REDIS_CLIENT.get(lastInstanceSocketKey())).to.equal(null);
    });

    it('should not fail when the last socket of an instance cannot be recorded or forgotten', async () => {
      TEST_REDIS_CLIENT.set = () => Promise.reject(new Error('Redis is down'));
      TEST_REDIS_CLIENT.eval = () => Promise.reject(new Error('Redis is down'));

      await TEST_MODELS.socketModel.setLastInstanceSocket(INSTANCE_ID, { id: 'socket-id', disconnected: false });
      await TEST_MODELS.socketModel.clearLastInstanceSocket(INSTANCE_ID, 'socket-id');
    });

    it('should not fail the promotion of a primary instance when the cache cannot be cleared', async () => {
      TEST_REDIS_CLIENT.del = () => Promise.reject(new Error('Redis is down'));

      await TEST_MODELS.instanceModel.setInstanceAsPrimaryInstance(ACCOUNT_ID, INSTANCE_ID);
    });

    it('should promote a primary instance in an account without any user', async () => {
      await TEST_MODELS.instanceModel.setInstanceAsPrimaryInstance('d3b07384-d9a0-4c5e-8f1a-2b3c4d5e6f70', INSTANCE_ID);
    });
  });
});
