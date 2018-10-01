module.exports = function(logger, socketModel) {

  async function connection(socket) {

    var isClientAuthenticated = false;

    // the client has 5 seconds to authenticate
    // if not, he is disconnected
    setTimeout(() => {
      if(isClientAuthenticated === false) {
        socket.disconnect();
      }
    }, 5000);

    socket.on('user-authentication', async function(data, fn) {
      
      try {
        // we first authenticate the user thanks to his access token
        var user = await socketModel.authenticateUser(data.access_token);
        
        // then he can join two new rooms
        socket.join('user:' + user.id);
        socket.join('account:users:' + user.account_id);

        // on message (request to one instance)
        socket.on('message', (message, callback) => socketModel.handleNewMessage(user, message, callback));
        
        isClientAuthenticated = true;

        logger.debug(`User ${user.id} connected in websockets`);

        // we answer the client that he is authenticated
        fn({authenticated: true});

        socket.on('disconnect', function () {
          socketModel.disconnectUser(user);
        });
      } catch(e) {
        logger.warn(e);

        fn({authenticated: false});

        // disconnect socket
        socket.disconnect();
      }
    });

    socket.on('instance-authentication', async function(data, fn) {

      try {
        // we first authenticate the instance thanks to his access token
        var instance = await socketModel.authenticateInstance(data.access_token);
        
        // then he can join two new rooms
        socket.join('instance:' + instance.id);
        socket.join('account:instances:' + instance.account_id);

        // on message (message to user)
        socket.on('message', (message, callback) => socketModel.handleNewMessageFromInstance(instance, message, callback));
        
        isClientAuthenticated = true;

        logger.debug(`Instance ${instance.id} connected in websockets`);

        // we answer the client that he is authenticated
        fn({authenticated: true});

        socket.on('disconnect', function () {
          socketModel.disconnectInstance(user);
        });

      } catch(e) {
        logger.warn(e);

        fn({authenticated: false});

        // disconnect socket
        socket.disconnect();
      }
    });
  }

  return {
    connection
  };
};