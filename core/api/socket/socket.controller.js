module.exports = function SocketController(logger, socketModel, io, instanceModel) {
  async function authenticateUser(socket, accessToken) {
    try {
      // we first authenticate the user thanks to his access token
      const user = await socketModel.authenticateUser(accessToken, socket.id);

      // then he can join his rooms
      socket.join(`user:${user.id}`);
      socket.join(socketModel.getUserRoom(user.account_id, user.id));
      socket.join(`account:users:${user.account_id}`);

      // on message (request to one instance)
      socket.on('message', (message, callback) => socketModel.handleNewMessageFromUser(user, message, callback));

      // useful to calculate latency
      socket.on('latency', (startTime, cb) => {
        cb(startTime);
      });

      // we ask connected instance to refresh it's user list as a new user is connected
      socketModel.askInstanceToRefreshConnectedUsers(user.account_id);

      socket.on('disconnect', () => {
        // socket disconnected
        // we ask connected instance to refresh it's user list as user is diconnected
        socketModel.askInstanceToRefreshConnectedUsers(user.account_id);
      });

      return { isAuthenticated: true, user };
    } catch (e) {
      logger.debug(e);

      return { isAuthenticated: false, reason: e.message };
    }
  }

  async function authenticateInstance(socket, accessToken) {
    try {
      // we first authenticate the instance thanks to his access token
      const instance = await socketModel.authenticateInstance(accessToken, socket.id);
      // This instance is the primary instance
      await instanceModel.setInstanceAsPrimaryInstance(instance.account_id, instance.id);

      // then he can join its rooms
      socket.join(`instance:${instance.id}`);
      socket.join(socketModel.getInstanceRoom(instance.account_id, instance.id));
      socket.join(`account:instances:${instance.account_id}`);

      // on message (message to user)
      socket.on('message', (message, callback) =>
        socketModel.handleNewMessageFromInstance(instance, message, callback),
      );

      // useful to calculate latency
      socket.on('latency', (startTime, cb) => {
        cb(startTime);
      });

      logger.info(`Instance ${instance.id} connected in websockets, socket version = ${socket.conn.protocol}`);

      // we send a message to all users saying the instance is connected
      socketModel.hello(instance);

      return { isAuthenticated: true, instance };
    } catch (e) {
      logger.debug(e);

      return { isAuthenticated: false, reason: e.message };
    }
  }

  async function connection(socket) {
    logger.info(
      `New socket joined, socket_id = ${socket.id}, version = ${socket.conn.protocol}, auth = ${
        socket.handshake.auth.auth_type ? socket.handshake.auth.auth_type : 'false'
      }`,
    );

    let isClientAuthenticated = false;
    // A socket is authenticated at most once: each successful authentication registers
    // "message" listeners, so re-authenticating would relay every message several times
    let authenticationInProgress = false;

    const startAuthentication = () => {
      if (isClientAuthenticated || authenticationInProgress) {
        return false;
      }
      authenticationInProgress = true;
      return true;
    };

    // if the client has an user token, we authenticate him
    if (socket.handshake.auth.auth_type === 'user' && startAuthentication()) {
      const { isAuthenticated, reason } = await authenticateUser(socket, socket.handshake.auth.access_token);

      isClientAuthenticated = isAuthenticated;
      authenticationInProgress = false;

      if (isAuthenticated === true) {
        socket.emit('user-authenticated');
      } else {
        socket.emit('user-authentication-failed', { reason });
        logger.warn(`User ${socket.id} authentication failed, reason = ${reason}`);
        socket.disconnect();
      }
    }

    // if the client has an instance token, we authenticate him
    if (socket.handshake.auth.auth_type === 'instance' && startAuthentication()) {
      const { isAuthenticated, reason } = await authenticateInstance(socket, socket.handshake.auth.access_token);

      isClientAuthenticated = isAuthenticated;
      authenticationInProgress = false;

      if (isAuthenticated === true) {
        socket.emit('instance-authenticated');
      } else {
        socket.emit('instance-authentication-failed', { reason });
        logger.warn(`Instance ${socket.id} authentication failed, reason = ${reason}`);
        socket.disconnect();
      }
    }

    // the client has 90 seconds to authenticate
    // if not, he is disconnected
    setTimeout(() => {
      if (isClientAuthenticated === false) {
        socket.disconnect();
      }
    }, 90 * 1000);

    const answer = (fn, response) => {
      if (typeof fn === 'function') {
        fn(response);
      }
    };

    socket.on('user-authentication', async (data, fn) => {
      // already authenticated (or being authenticated): nothing to redo
      if (!startAuthentication()) {
        answer(fn, { authenticated: isClientAuthenticated });
        return;
      }

      const { isAuthenticated } = await authenticateUser(socket, data && data.access_token);

      isClientAuthenticated = isAuthenticated;
      authenticationInProgress = false;
      // we answer the client that he is authenticated
      answer(fn, { authenticated: isAuthenticated });

      if (isAuthenticated === false) {
        socket.disconnect();
      }
    });

    socket.on('instance-authentication', async (data, fn) => {
      // already authenticated (or being authenticated): nothing to redo
      if (!startAuthentication()) {
        answer(fn, { authenticated: isClientAuthenticated });
        return;
      }

      const { isAuthenticated } = await authenticateInstance(socket, data && data.access_token);

      isClientAuthenticated = isAuthenticated;
      authenticationInProgress = false;

      // we answer the client that he is authenticated
      answer(fn, { authenticated: isAuthenticated });

      if (isAuthenticated === false) {
        socket.disconnect();
      }
    });
  }

  return {
    connection,
  };
};
