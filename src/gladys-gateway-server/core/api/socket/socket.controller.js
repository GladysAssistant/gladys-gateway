module.exports = function SocketController(logger, socketModel, io) {
  async function connection(socket) {
    logger.debug(`New socket joined, socket_id = ${socket.id}`);

    let isClientAuthenticated = false;

    // the client has 10 seconds to authenticate
    // if not, he is disconnected
    setTimeout(() => {
      if (isClientAuthenticated === false) {
        socket.disconnect();
      }
    }, 10000);

    socket.on('user-authentication', async (data, fn) => {
      try {
        // we first authenticate the user thanks to his access token
        const user = await socketModel.authenticateUser(data.access_token, socket.id);

        // then he can join two new rooms
        socket.join(`user:${user.id}`);
        socket.join(`account:users:${user.account_id}`);

        // on message (request to one instance)
        socket.on('message', (message, callback) => socketModel.handleNewMessageFromUser(user, message, callback));

        // useful to calculate latency
        socket.on('latency', (startTime, cb) => {
          cb(startTime);
        });

        isClientAuthenticated = true;

        logger.info(`User ${user.id} connected in websockets`);

        // we answer the client that he is authenticated
        fn({ authenticated: true });

        socket.on('disconnect', () => {
          // socket disconnected
        });
      } catch (e) {
        fn({ authenticated: false });

        // disconnect socket
        socket.disconnect();
      }
    });

    socket.on('instance-authentication', async (data, fn) => {
      try {
        // we first authenticate the instance thanks to his access token
        const instance = await socketModel.authenticateInstance(data.access_token, socket.id);

        // then he can join two new rooms
        socket.join(`instance:${instance.id}`);
        socket.join(`account:instances:${instance.account_id}`);

        // on message (message to user)
        socket.on('message', (message, callback) => socketModel.handleNewMessageFromInstance(instance, message, callback));

        // useful to calculate latency
        socket.on('latency', (startTime, cb) => {
          cb(startTime);
        });

        isClientAuthenticated = true;

        logger.info(`Instance ${instance.id} connected in websockets`);

        // we answer the client that he is authenticated
        fn({ authenticated: true });

        // we send a message to all users saying the instance is connected
        socketModel.hello(instance);

        socket.on('disconnect', () => {
          // socket disconnected
        });
      } catch (e) {
        fn({ authenticated: false });

        // disconnect socket
        socket.disconnect();
      }
    });
  }

  return {
    connection,
  };
};
