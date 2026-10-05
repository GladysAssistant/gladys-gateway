const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { NotFoundError, GatewayTimeoutError } = require('../../common/error');
const { readPositiveIntegerEnv } = require('../../common/env');

// Relays a message to an instance connected to another node of the cluster
const SERVER_TO_SERVER_COMMUNICATION = 'find-socket-and-send-message';
// Asks every node of the cluster for the ids of the instances connected to it
const SERVER_TO_SERVER_GET_CONNECTED_INSTANCES = 'get-connected-instance-ids';
const INSTANCE_ROOM_PREFIX = 'instance:';
// The last socket an instance authenticated with, on any node of the cluster. When the
// instance is connected to several nodes (it reconnected to another node before the previous
// connection was detected dead, two Gladys sharing the same credentials), only the node
// holding this socket relays a message: a command never runs twice, nor on a dead connection.
const INSTANCE_SOCKET_PREFIX = 'instance_socket';
const INSTANCE_SOCKET_TTL_IN_SECONDS = 24 * 60 * 60;
// Without a last socket known (expired, Redis failure), the first node holding a socket of
// the instance to claim the request relays it
const RELAY_CLAIM_PREFIX = 'instance_message_relay';
const RELAY_CLAIM_TTL_IN_SECONDS = 60;
// Deletes the last socket of an instance, unless another connection replaced it meanwhile
const DELETE_IF_EQUAL_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

// An instance that never acknowledges a message (handler crashed, Raspberry Pi frozen...)
// must not hold the caller forever: without a timeout the ack callback stays in memory until
// the socket disconnects, and the HTTP request of an Open API / Google Home / Alexa call hangs.
// Messages of the dashboard can legitimately be long (a Zigbee2mqtt setup pulls containers),
// the Open API ones answer third parties that give up after a few seconds anyway.
const DEFAULT_USER_MESSAGE_TIMEOUT_IN_MS = 5 * 60 * 1000;
const DEFAULT_OPEN_API_MESSAGE_TIMEOUT_IN_MS = 30 * 1000;

function isOpenApiMessage(message) {
  return message.type === 'gladys-open-api';
}

function getMessageTimeoutInMs(message) {
  if (isOpenApiMessage(message)) {
    return readPositiveIntegerEnv('INSTANCE_OPEN_API_MESSAGE_TIMEOUT_IN_MS', DEFAULT_OPEN_API_MESSAGE_TIMEOUT_IN_MS);
  }
  return readPositiveIntegerEnv('INSTANCE_MESSAGE_TIMEOUT_IN_MS', DEFAULT_USER_MESSAGE_TIMEOUT_IN_MS);
}

// Calls the callback once at most: a message can be answered by the instance, its timeout,
// its disconnection or an error, whichever comes first
function once(callback) {
  let called = false;
  return (response) => {
    if (!called) {
      called = true;
      callback(response);
    }
  };
}

module.exports = function SocketModel(logger, db, redisClient, io, fingerprint, analyticsService) {
  const instanceTimeoutError = () => new GatewayTimeoutError('INSTANCE_TIMEOUT').jsonError();
  const instanceNotFoundError = () => new NotFoundError('NO_INSTANCE_FOUND').jsonError();

  /**
   * The socket of the instance in this room, if it is connected to this node. When an instance
   * reconnects before the server noticed its previous connection died, both sockets are in the
   * room for a while (up to pingInterval + pingTimeout): the last one to join is the live one.
   */
  function getLocalSocketInRoom(room) {
    const socketIds = typeof room === 'string' ? io.of('/').adapter.rooms.get(room) : undefined;
    if (!socketIds || socketIds.size === 0) {
      return null;
    }
    const lastSocketId = Array.from(socketIds).pop();
    return io.of('/').sockets.get(lastSocketId) || null;
  }

  // The answers still awaited from each socket: socket.io does not call the pending acks
  // when a socket disconnects, the caller would wait for the whole timeout
  const pendingAnswersBySocket = new WeakMap();

  function trackPendingAnswer(socket, answer) {
    let pendingAnswers = pendingAnswersBySocket.get(socket);
    if (!pendingAnswers) {
      pendingAnswers = new Set();
      pendingAnswersBySocket.set(socket, pendingAnswers);
      // a single listener per socket, whatever the number of messages in flight
      socket.once('disconnect', () => {
        pendingAnswersBySocket.delete(socket);
        pendingAnswers.forEach((pendingAnswer) => pendingAnswer(instanceNotFoundError()));
      });
    }
    pendingAnswers.add(answer);
    return () => pendingAnswers.delete(answer);
  }

  function emitToInstanceSocket(socket, message, timeoutInMs, callback) {
    const answer = once(callback);
    const untrack = trackPendingAnswer(socket, answer);
    const event = isOpenApiMessage(message) ? 'open-api-message' : 'message';
    try {
      socket.timeout(timeoutInMs).emit(event, message, (err, response) => {
        untrack();
        answer(err ? instanceTimeoutError() : response);
      });
    } catch (e) {
      untrack();
      throw e;
    }
  }

  // Ids of the instances connected to this node: every authenticated instance socket is
  // alone in its room "instance:<id>" (see the socket controller), and the adapter drops the
  // rooms left empty. Reading the room names is enough, no socket is serialized.
  function getLocalConnectedInstanceIds() {
    const instanceIds = [];
    io.of('/').adapter.rooms.forEach((socketIds, room) => {
      if (room.startsWith(INSTANCE_ROOM_PREFIX)) {
        instanceIds.push(room.slice(INSTANCE_ROOM_PREFIX.length));
      }
    });
    return instanceIds;
  }

  function getInstanceSocketKey(instanceId) {
    return `${INSTANCE_SOCKET_PREFIX}:${instanceId}`;
  }

  /**
   * Records the socket an instance just authenticated with as its last one. Called once the
   * socket joined the rooms of the instance; never throws (a failure only falls back to the
   * claim when relaying across nodes).
   */
  async function setLastInstanceSocket(instanceId, socketId) {
    try {
      await redisClient.set(getInstanceSocketKey(instanceId), socketId, { EX: INSTANCE_SOCKET_TTL_IN_SECONDS });
    } catch (e) {
      logger.warn(`Unable to record the socket of instance ${instanceId}`);
      logger.warn(e);
    }
  }

  // The socket of the instance disconnected: forget it, unless a newer connection replaced it
  async function clearLastInstanceSocket(instanceId, socketId) {
    try {
      await redisClient.eval(DELETE_IF_EQUAL_SCRIPT, {
        keys: [getInstanceSocketKey(instanceId)],
        arguments: [socketId],
      });
    } catch (e) {
      logger.warn(`Unable to forget the socket of instance ${instanceId}`);
      logger.warn(e);
    }
  }

  // Whether this node is the one relaying the message: the first node holding a socket of
  // the instance to claim the request relays it. Relays anyway when Redis fails, a message
  // relayed twice in that rare case is better than a message lost.
  async function claimRelay(requestId) {
    try {
      const claimed = await redisClient.set(`${RELAY_CLAIM_PREFIX}:${requestId}`, '1', {
        NX: true,
        EX: RELAY_CLAIM_TTL_IN_SECONDS,
      });
      return claimed === 'OK';
    } catch (e) {
      logger.warn(`Unable to claim the relay of request ${requestId}, relaying it anyway`);
      logger.warn(e);
      return true;
    }
  }

  /**
   * The socket of this node that relays a message from another node, if any: the last socket
   * the instance authenticated with when this node holds it, none when another node does.
   * Without a last socket known, the node that claims the request first relays it.
   */
  async function getRelaySocket(data) {
    const localSocket = data && data.message ? getLocalSocketInRoom(data.room) : null;
    if (!localSocket) {
      return null;
    }
    let lastSocketId = null;
    try {
      lastSocketId = await redisClient.get(getInstanceSocketKey(data.message.instance_id));
    } catch (e) {
      logger.warn(`Unable to read the last socket of instance ${data.message.instance_id}`);
      logger.warn(e);
    }
    if (lastSocketId) {
      const lastSocket = io.of('/').sockets.get(lastSocketId);
      // the room is scoped by account: the last socket must be in the room asked for
      return lastSocket && lastSocket.rooms.has(data.room) ? lastSocket : null;
    }
    return (await claimRelay(data.request_id)) ? localSocket : null;
  }

  // handle messages from different nodes: only the node holding the socket of the instance
  // relays the message and answers { found: true, response }, the others answer null. The
  // response is wrapped: an instance can acknowledge with nothing, that is not "not here".
  io.on(SERVER_TO_SERVER_COMMUNICATION, async (data, cb) => {
    const socket = await getRelaySocket(data);
    if (!socket) {
      cb(null);
      return;
    }
    // no try/catch needed here: a message socket.io could not emit again could not have been
    // serialized by the origin node either, it never reaches this node
    emitToInstanceSocket(socket, data.message, getMessageTimeoutInMs(data.message), (response) => {
      cb({ found: true, response });
    });
  });

  io.on(SERVER_TO_SERVER_GET_CONNECTED_INSTANCES, (cb) => {
    cb(getLocalConnectedInstanceIds());
  });

  // Rooms are scoped by account so a user can only reach the instances of his own
  // account, and an instance can only reach the users of its own account.
  function getInstanceRoom(accountId, instanceId) {
    return `account:${accountId}:instance:${instanceId}`;
  }

  function getUserRoom(accountId, userId) {
    return `account:${accountId}:user:${userId}`;
  }

  async function isUserConnected(userId) {
    try {
      const sockets = await io.in(`user:${userId}`).fetchSockets();
      return sockets.length > 0;
    } catch (e) {
      return false;
    }
  }

  async function authenticateUser(accessToken, socketId) {
    // we decode the jwt and see if the access token is right
    const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_TOKEN_SECRET, {
      algorithms: ['HS256'],
      issuer: 'gladys-gateway',
      audience: 'user',
    });

    if (decoded.scope.includes('dashboard:write') === false) {
      throw new Error(
        `Unauthorized: The user "${decoded.user_id}" does not have the scope "dashboard:write" which is required to connect in websocket`,
      );
    }

    // we get the user and his account_id
    const user = await db.t_user.findOne(
      {
        id: decoded.user_id,
      },
      { fields: ['id', 'account_id', 'gladys_4_user_id'] },
    );

    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND');
    }

    return user;
  }

  async function authenticateInstance(accessToken, socketId) {
    // we decode the jwt and see if the access token is right
    const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_TOKEN_SECRET, {
      algorithms: ['HS256'],
      issuer: 'gladys-gateway',
      audience: 'instance',
    });

    // we get the instance and his account_id
    const instance = await db.t_instance.findOne(
      {
        id: decoded.instance_id,
      },
      { fields: ['id', 'account_id', 'primary_instance', 'rsa_public_key', 'ecdsa_public_key'] },
    );

    if (!instance) {
      throw new NotFoundError('INSTANCE_NOT_FOUND');
    }

    return instance;
  }

  /**
   * Ids of the instances connected right now, on any node of the cluster. Each node answers
   * with the ids of its own instances only: fetching every socket of the cluster would
   * serialize all of them (handshake included) through Redis. Throws when a node does not
   * answer: a partial list would make the watchdog report its instances offline.
   */
  async function getConnectedInstanceIds() {
    const remoteInstanceIds = await new Promise((resolve, reject) => {
      io.serverSideEmit(SERVER_TO_SERVER_GET_CONNECTED_INSTANCES, (err, replies) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(replies.flat());
      });
    });
    return new Set([...getLocalConnectedInstanceIds(), ...remoteInstanceIds]);
  }

  function askInstanceToRefreshConnectedUsers(accountId) {
    io.to(`account:instances:${accountId}`).emit('clear-connected-users-list');
  }

  function relayMessageFromUser(user, messageParam, answer) {
    const message = messageParam;
    analyticsService.sendMessageSizeMetric('message-to-instance', message, user.id);

    // add sender_id to message
    message.sender_id = user.id;

    // add local gladys id
    message.local_user_id = user.gladys_4_user_id;

    const room = getInstanceRoom(user.account_id, message.instance_id);

    // The instance is connected to this node (always the case with a single node): the
    // message goes straight to its socket, without any round-trip to Redis
    const localSocket = getLocalSocketInRoom(room);
    if (localSocket) {
      emitToInstanceSocket(localSocket, message, getMessageTimeoutInMs(message), answer);
      return;
    }

    // Else, the other nodes are asked in a single round-trip: the one holding the socket
    // relays the message and answers with the response of the instance, the others answer null.
    // Across nodes, the requestsTimeout of the Redis adapter caps the timeout of the message.
    const request = { request_id: crypto.randomUUID(), room, message };
    io.serverSideEmit(SERVER_TO_SERVER_COMMUNICATION, request, (err, replies) => {
      const relayed = (replies || []).find((reply) => reply && reply.found === true);

      if (relayed) {
        analyticsService.sendMessageSizeMetric('message-to-instance-response', relayed.response, user.id);
        answer(relayed.response);
        return;
      }

      if (err) {
        logger.warn(`INSTANCE_TIMEOUT (no answer from the cluster) user_id=${user.id}`);
        answer(instanceTimeoutError());
        return;
      }

      // Expected when the instance is offline — compact warn, no stack
      logger.warn(`INSTANCE_NOT_FOUND user_id=${user.id}`);
      answer(instanceNotFoundError());
    });
  }

  function handleNewMessageFromUser(user, message, callback) {
    // a client can emit a message without waiting for an answer
    const answer = once(typeof callback === 'function' ? callback : () => {});

    if (message === null || typeof message !== 'object' || typeof message.instance_id !== 'string') {
      logger.warn(`INSTANCE_NOT_FOUND (invalid message) user_id=${user.id}`);
      answer(instanceNotFoundError());
      return;
    }

    logger.debug(`Received message from user ${user.id}`);

    // This handler runs in the event dispatch of socket.io: an exception would crash the
    // process. A user can send a payload socket.io cannot emit again (nested so deeply that
    // the recursive binary check overflows the stack).
    try {
      relayMessageFromUser(user, message, answer);
    } catch (e) {
      logger.error(`HANDLE_NEW_MESSAGE_FROM_USER_ERROR user_id=${user.id}: ${e.message}`);
      answer(instanceNotFoundError());
    }
  }

  function handleNewMessageFromInstance(instance, messageParam) {
    const message = messageParam;
    logger.debug(`New message from instance ${instance.id}`);

    if (message === null || typeof message !== 'object' || typeof message.user_id !== 'string') {
      logger.warn(`Instance ${instance.id} sent a message without a valid user_id`);
      return;
    }

    analyticsService.sendMessageSizeMetric('message-to-user', message, instance.id);

    // adding sending instance_id
    message.instance_id = instance.id;

    // the room is scoped by account: a user from another account is never in it. Same as for
    // the messages of the users, an exception here would crash the process.
    try {
      io.to(getUserRoom(instance.account_id, message.user_id)).emit('message', message);
    } catch (e) {
      logger.error(`HANDLE_NEW_MESSAGE_FROM_INSTANCE_ERROR instance_id=${instance.id}: ${e.message}`);
    }
  }

  async function hello(instance) {
    const rsaFingerprint = fingerprint.generate(instance.rsa_public_key);
    const ecdsaFingerprint = fingerprint.generate(instance.ecdsa_public_key);

    io.to(`account:users:${instance.account_id}`).emit('hello', {
      id: instance.id,
      rsa_fingerprint: rsaFingerprint,
      ecdsa_fingerprint: ecdsaFingerprint,
    });
  }

  async function askInstanceToClearKeyCache(accountId) {
    io.to(`account:instances:${accountId}`).emit('clear-key-cache');
  }

  // Disconnects every socket of the user, on every node of the cluster
  async function disconnectUser(userId) {
    io.in(`user:${userId}`).disconnectSockets(true);
  }

  async function sendMessageOpenApi(user, message) {
    return new Promise((resolve, reject) => {
      handleNewMessageFromUser(user, message, (response) => {
        if (response && response.error_code === 'NOT_FOUND') {
          reject(new NotFoundError('NO_INSTANCE_FOUND'));
        } else if (response && response.error_code === 'GATEWAY_TIMEOUT') {
          reject(new GatewayTimeoutError('INSTANCE_TIMEOUT'));
        } else {
          resolve(response);
        }
      });
    });
  }

  return {
    getInstanceRoom,
    getUserRoom,
    authenticateUser,
    authenticateInstance,
    disconnectUser,
    handleNewMessageFromUser,
    handleNewMessageFromInstance,
    hello,
    askInstanceToClearKeyCache,
    isUserConnected,
    sendMessageOpenApi,
    askInstanceToRefreshConnectedUsers,
    getConnectedInstanceIds,
    setLastInstanceSocket,
    clearLastInstanceSocket,
  };
};
