const jwt = require('jsonwebtoken');
const { NotFoundError } = require('../../common/error');

module.exports = function SocketModel(logger, db, redisClient, io, fingerprint, statsService) {

  // handle messages from different nodes
  io.of('/').adapter.customHook = (data, cb) => {

    // we look if we have the socket here
    var socket = io.sockets.connected[data.socket_id];

    // if no, we return null
    if(!socket) {
      return cb(null);
    } 

    // if message is a disconnect instruction
    else if(data.disconnect === true) {
      socket.disconnect();
      cb(true);
    }

    // if message is an open API message
    else if(data.message && data.message.type === 'gladys-open-api') {
      socket.emit('open-api-message', data.message, cb);
    }  
    
    // else, we emit the message
    else {
      socket.emit('message', data.message, cb);
    }
  };

  function getInstanceSocketId(instanceId) {
    return new Promise(function(resolve, reject){
      var roomName = 'instance:' + instanceId;

      io.in(roomName).clients((err, clients) => {
        if(err || clients.length === 0) {
          reject();
        } else {
          resolve(clients[0]);
        }
      });
    });
  }

  async function getUserSocketId(userId) {
    return new Promise(function(resolve, reject){
      var roomName = 'user:' + userId;

      io.in(roomName).clients((err, clients) => {
        if(err || clients.length === 0) {
          reject();
        } else {
          resolve(clients[0]);
        }
      });
    });
  }

  async function isUserConnected(userId) {
    return new Promise(function(resolve, reject){
      var roomName = 'user:' + userId;

      io.in(roomName).clients((err, clients) => {
        if(err || clients.length === 0) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  async function authenticateUser(accessToken, socketId){
    
    // we decode the jwt and see if the access token is right
    var decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_TOKEN_SECRET, {
      issuer: 'gladys-gateway',
      audience: 'user'
    });

    if(decoded.scope.includes('dashboard:write') === false) {
      throw new Error(`Unauthorized: The user "${decoded.user_id}" does not have the scope "dashboard:write" which is required to connect in websocket`);
    }
    
    // we get the user and his account_id
    var user = await db.t_user.findOne({
      id: decoded.user_id
    }, {fields: ['id', 'account_id']});

    return user;
  }

  async function authenticateInstance(accessToken, socketId) {
     
    // we decode the jwt and see if the access token is right
    var decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_TOKEN_SECRET, {
      issuer: 'gladys-gateway',
      audience: 'instance'
    });
    
    // we get the instance and his account_id
    var instance = await db.t_instance.findOne({
      id: decoded.instance_id
    }, {fields: ['id', 'account_id', 'rsa_public_key', 'ecdsa_public_key']});

    return instance;
  }

  async function handleNewMessageFromUser(user, message, callback) {
    logger.debug(`Received message from user ${user.id}`);

    statsService.track('messageToInstance', {
      user_id: user.id
    });
    
    // add sender_id to message
    message.sender_id = user.id;
    try {
      var socketId = await getInstanceSocketId(message.instance_id);
      
      io.of('/').adapter.customRequest({socket_id: socketId, message}, function(err, replies) {
      
        if(err) {
          var notFound = new NotFoundError('NO_INSTANCE_FOUND');
          return callback(notFound.jsonError());
        }
  
        // remove null response from other instances
        replies = replies.filter(reply => reply !== null);
  
        if(replies.length === 0) {
          var notFound = new NotFoundError('NO_INSTANCE_FOUND');
          callback(notFound.jsonError());
        } else {
          callback(replies[0]);
        }
      });
    } catch (e) {
      var notFound = new NotFoundError('NO_INSTANCE_FOUND');
      return callback(notFound.jsonError());
    }
  }

  async function handleNewMessageFromInstance(instance, message) {
    logger.debug(`New message from instance ${instance.id}`);

    statsService.track('messageToUser', {
      instance_id: instance.id
    });
    
    // adding sending instance_id
    message.instance_id = instance.id;

    var roomName = 'connected_user:' + message.user_id;

    io.to(roomName).emit('message', message);
  }

  async function hello(instance) {
    var rsaFingerprint = fingerprint.generate(instance.rsa_public_key);
    var ecdsaFingerprint = fingerprint.generate(instance.ecdsa_public_key);

    io.to('account:users:' + instance.account_id).emit('hello', {
      id: instance.id,
      rsa_fingerprint: rsaFingerprint,
      ecdsa_fingerprint: ecdsaFingerprint
    });
  }

  async function askInstanceToClearKeyCache(accountId) {
    io.to('account:instances:' + accountId).emit('clear-key-cache');
  }

  async function disconnectUser(userId) {

    try {
      let socketId = await getUserSocketId(userId);

      io.of('/').adapter.customRequest({socket_id: socketId, disconnect: true }, function(err, replies) {
        if(err) {
          logger.warn('socketModel.disconnectUser : error while trying to disconnect user ' + userId);
        }
      });
    } catch(e) {
      // user not connected
    }
  }

  async function sendMessageOpenApi (user, message) {
    return new Promise((resolve, reject) => {
      handleNewMessageFromUser(user, message, function(response) {
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
    sendMessageOpenApi
  };
};