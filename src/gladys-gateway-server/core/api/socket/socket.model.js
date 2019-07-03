const jwt = require('jsonwebtoken');
const sizeof = require('object-sizeof');
const { NotFoundError } = require('../../common/error');

module.exports = function SocketModel(logger, db, redisClient, io, fingerprint, statsService) {
  const ioAdapter = io;
  // handle messages from different nodes
  ioAdapter.of('/').adapter.customHook = (data, cb) => {
    // we look if we have the socket here
    const socket = io.sockets.connected[data.socket_id];

    // if no, we return null
    if (!socket) {
      return cb(null);
    }

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

    return null;
  };

  function getInstanceSocketId(instanceId) {
    return new Promise((resolve, reject) => {
      const roomName = `instance:${instanceId}`;

      io.in(roomName).clients((err, clients) => {
        if (err || clients.length === 0) {
          reject();
        } else {
          resolve(clients[0]);
        }
      });
    });
  }

  async function getUserSocketId(userId) {
    return new Promise((resolve, reject) => {
      const roomName = `user:${userId}`;

      io.in(roomName).clients((err, clients) => {
        if (err || clients.length === 0) {
          reject();
        } else {
          resolve(clients[0]);
        }
      });
    });
  }

  async function isUserConnected(userId) {
    return new Promise((resolve, reject) => {
      const roomName = `user:${userId}`;

      io.in(roomName).clients((err, clients) => {
        if (err || clients.length === 0) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  async function authenticateUser(accessToken, socketId) {
    // we decode the jwt and see if the access token is right
    const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_TOKEN_SECRET, {
      issuer: 'gladys-gateway',
      audience: 'user',
    });

    if (decoded.scope.includes('dashboard:write') === false) {
      throw new Error(
        `Unauthorized: The user "${
          decoded.user_id
        }" does not have the scope "dashboard:write" which is required to connect in websocket`,
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

  async function handleNewMessageFromUser(user, messageParam, callback) {
    logger.debug(`Received message from user ${user.id}`);

    statsService.track('MESSAGE_TO_INSTANCE', {
      user_id: user.id,
      message_size: sizeof(messageParam),
    });

    const message = messageParam;

    // add sender_id to message
    message.sender_id = user.id;

    // add local gladys id
    message.local_user_id = user.gladys_4_user_id;

    try {
      const socketId = await getInstanceSocketId(message.instance_id);

      return io.of('/').adapter.customRequest({ socket_id: socketId, message }, (err, replies) => {
        if (err) {
          const notFound = new NotFoundError('NO_INSTANCE_FOUND');
          return callback(notFound.jsonError());
        }

        // remove null response from other instances
        const filteredReplies = replies.filter(reply => reply !== null);

        if (filteredReplies.length === 0) {
          const notFound = new NotFoundError('NO_INSTANCE_FOUND');
          return callback(notFound.jsonError());
        }

        return callback(filteredReplies[0]);
      });
    } catch (e) {
      const notFound = new NotFoundError('NO_INSTANCE_FOUND');
      return callback(notFound.jsonError());
    }
  }

  async function handleNewMessageFromInstance(instance, messageParam) {
    logger.debug(`New message from instance ${instance.id}`);

    statsService.track('MESSAGE_TO_USER', {
      instance_id: instance.id,
      message_size: sizeof(messageParam),
    });

    const message = messageParam;

    // adding sending instance_id
    message.instance_id = instance.id;

    const roomName = `connected_user:${message.user_id}`;

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

      io.of('/').adapter.customRequest({ socket_id: socketId, disconnect: true }, (err, replies) => {
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
  };
};
