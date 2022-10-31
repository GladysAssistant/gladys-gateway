const jwt = require('jsonwebtoken');
const sizeof = require('object-sizeof');
const { NotFoundError } = require('../../common/error');

const SERVER_TO_SERVER_COMMUNICATION = 'find-socket-and-send-message';

module.exports = function SocketModel(
  logger,
  db,
  redisClient,
  io,
  fingerprint,
  statsService,
  analyticsService,
  errorService,
) {
  function sendMessage(socket, data, cb) {
    if (data.disconnect === true) {
      // if message is a disconnect instruction
      socket.disconnect();
      cb(true);
    } else if (data.message && data.message.type === 'gladys-open-api') {
      // if message is an open API message
      socket.emit('open-api-message', data.message, cb);
    } else {
      // else, we emit the message
      socket.emit('message', data.message, cb);
    }
  }

  // handle messages from different nodes
  io.on(SERVER_TO_SERVER_COMMUNICATION, (data, cb) => {
    // we look if we have the socket here
    const socket = io.of('/').sockets.get(data.socket_id);

    // if no, we return null
    if (!socket) {
      return cb(null);
    }

    sendMessage(socket, data, cb);

    return null;
  });

  async function getInstanceSocketId(instanceId) {
    const sockets = await io.in(`instance:${instanceId}`).fetchSockets();

    if (sockets.length === 0) {
      throw new Error('INSTANCE_NOT_FOUND');
    }

    const [firstInstance] = sockets;
    return firstInstance;
  }

  async function getUserSocketId(userId) {
    const sockets = await io.in(`user:${userId}`).fetchSockets();

    if (sockets.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    const [firstUser] = sockets;
    return firstUser;
  }

  async function isUserConnected(userId) {
    try {
      await getUserSocketId(userId);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function authenticateUser(accessToken, socketId) {
    // we decode the jwt and see if the access token is right
    const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_TOKEN_SECRET, {
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

    return user;
  }

  async function authenticateInstance(accessToken, socketId) {
    // we decode the jwt and see if the access token is right
    const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_TOKEN_SECRET, {
      issuer: 'gladys-gateway',
      audience: 'instance',
    });

    // we get the instance and his account_id
    const instance = await db.t_instance.findOne(
      {
        id: decoded.instance_id,
      },
      { fields: ['id', 'account_id', 'rsa_public_key', 'ecdsa_public_key'] },
    );

    return instance;
  }

  function askInstanceToRefreshConnectedUsers(accountId) {
    io.to(`account:instances:${accountId}`).emit('clear-connected-users-list');
  }

  async function handleNewMessageFromUser(user, messageParam, callback) {
    logger.debug(`Received message from user ${user.id}`);

    const receivedAt = new Date().getTime();

    const messageSize = sizeof(messageParam);

    statsService.track('MESSAGE_TO_INSTANCE', {
      user_id: user.id,
      message_size: messageSize,
      sent_at: messageParam.sent_at,
      received_at: receivedAt,
    });

    analyticsService.sendMetric('message-to-instance', messageSize, user.id);

    const message = messageParam;

    // add sender_id to message
    message.sender_id = user.id;

    // add local gladys id
    message.local_user_id = user.gladys_4_user_id;

    try {
      const socket = await getInstanceSocketId(message.instance_id);

      // If the socket was found on a remote server
      if (socket.constructor.name === 'RemoteSocket') {
        io.serverSideEmit(SERVER_TO_SERVER_COMMUNICATION, { socket_id: socket.id, message }, (err, replies) => {
          if (err) {
            logger.error(err);
            const notFound = new NotFoundError('NO_INSTANCE_FOUND');
            return callback(notFound.jsonError());
          }

          // remove null response from other instances
          const filteredReplies = replies.filter((reply) => reply !== null);

          if (filteredReplies.length === 0) {
            logger.error('NO_INSTANCE_FOUND');
            const notFound = new NotFoundError('NO_INSTANCE_FOUND');
            return callback(notFound.jsonError());
          }

          const replySize = sizeof(filteredReplies[0]);

          analyticsService.sendMetric('message-to-instance-response', replySize, user.id);

          return callback(filteredReplies[0]);
        });
      } else {
        // if the socket was found on the same server
        sendMessage(socket, { message }, callback);
      }

      return null;
    } catch (e) {
      errorService.track('HANDLE_NEW_MESSAGE_FROM_USER_ERROR', {
        error: e,
        user_id: user.id,
      });
      const notFound = new NotFoundError('NO_INSTANCE_FOUND');
      return callback(notFound.jsonError());
    }
  }

  async function handleNewMessageFromInstance(instance, messageParam) {
    logger.debug(`New message from instance ${instance.id}`);

    const messageSize = sizeof(messageParam);

    statsService.track('MESSAGE_TO_USER', {
      instance_id: instance.id,
      message_size: messageSize,
      sent_at: messageParam.sent_at,
      received_at: new Date().getTime(),
    });

    analyticsService.sendMetric('message-to-user', messageSize, instance.id);

    const message = messageParam;

    // adding sending instance_id
    message.instance_id = instance.id;

    const roomName = `user:${message.user_id}`;

    io.to(roomName).emit('message', message);
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

  async function disconnectUser(userId) {
    try {
      const socketId = await getUserSocketId(userId);

      io.serverSideEmit(SERVER_TO_SERVER_COMMUNICATION, { socket_id: socketId, disconnect: true }, (err, replies) => {
        if (err) {
          logger.debug(`socketModel.disconnectUser : error while trying to disconnect user ${userId}`);
        }
      });
    } catch (e) {
      // user not connected
    }
  }

  async function sendMessageOpenApi(user, message) {
    return new Promise((resolve, reject) => {
      handleNewMessageFromUser(user, message, (response) => {
        if (response && response.error_code === 'NOT_FOUND') {
          reject(new NotFoundError('NO_INSTANCE_FOUND'));
        } else {
          resolve(response);
        }
      });
    });
  }

  return {
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
  };
};
