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
    return new Promise((resolve) => {
      socket.on(authenticatedEvent, () => resolve(socket));
    });
  }

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

  it('should relay a request from another node only once, whatever the number of nodes holding the instance', async () => {
    const socketInstance = await connectInstance(process.env.SERVER_PORT + 1);
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
    let originalIsEnabled;
    let originalSendMetric;
    let metrics;

    beforeEach(() => {
      ({ analyticsService } = TEST_SERVICES);
      originalIsEnabled = analyticsService.isEnabled;
      originalSendMetric = analyticsService.sendMetric;
      metrics = [];
      analyticsService.isEnabled = () => true;
      analyticsService.sendMetric = (type, value) => metrics.push({ type, value });
    });

    afterEach(() => {
      analyticsService.isEnabled = originalIsEnabled;
      analyticsService.sendMetric = originalSendMetric;
    });

    it('should measure the messages relayed in both directions when enabled', async () => {
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
      expect(metrics[1].value).to.equal(JSON.stringify({ response: 'response' }).length);
    });
  });

  describe('failures', () => {
    let originalServerSideEmit;
    let originalIn;
    let originalRedisSet;
    let originalRedisDel;

    beforeEach(() => {
      originalServerSideEmit = TEST_IO.serverSideEmit;
      originalIn = TEST_IO.in;
      originalRedisSet = TEST_REDIS_CLIENT.set;
      originalRedisDel = TEST_REDIS_CLIENT.del;
    });

    afterEach(() => {
      TEST_IO.serverSideEmit = originalServerSideEmit;
      TEST_IO.in = originalIn;
      TEST_REDIS_CLIENT.set = originalRedisSet;
      TEST_REDIS_CLIENT.del = originalRedisDel;
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

    it('should relay a message anyway when the relay cannot be claimed in Redis', async () => {
      const socketInstance = await connectInstance(process.env.SERVER_PORT);
      socketInstance.on('message', (data, cb) => cb({ response: 'response' }));
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

    it('should not fail the promotion of a primary instance when the cache cannot be cleared', async () => {
      TEST_REDIS_CLIENT.del = () => Promise.reject(new Error('Redis is down'));

      await TEST_MODELS.instanceModel.setInstanceAsPrimaryInstance(ACCOUNT_ID, INSTANCE_ID);
    });

    it('should promote a primary instance in an account without any user', async () => {
      await TEST_MODELS.instanceModel.setInstanceAsPrimaryInstance('d3b07384-d9a0-4c5e-8f1a-2b3c4d5e6f70', INSTANCE_ID);
    });
  });
});
