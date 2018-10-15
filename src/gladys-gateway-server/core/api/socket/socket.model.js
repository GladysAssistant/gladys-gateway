const jwt = require('jsonwebtoken');
const { NotFoundError } = require('../../common/error');

module.exports = function SocketModel(logger, db, redisClient, io, fingerprint) {

  // handle messages from different nodes
  io.of('/').adapter.customHook = (data, cb) => {

    // we look if we have the socket here
    var socket = io.sockets.connected[data.socket_id];

    // if no, we return null
    if(!socket) {
      return cb(null);
    } else {

      // else, we ask
      socket.emit('message', data.message, cb);
    }
  };

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

    // we save in redis that the user is connected
    await redisClient.setAsync('connected_user:' + user.id, socketId);

    return user;
  }

  async function disconnectUser(user) {
    await redisClient.delAsync('connected_user:' + user.id);
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

    // we save in redis that the instance is connected
    await redisClient.setAsync('connected_instance:' + instance.id, socketId);

    return instance;
  }

  async function disconnectInstance(instance) {
    await redisClient.delAsync('connected_instance:' + instance.id);
  }

  async function handleNewMessageFromUser(user, message, callback) {
    logger.debug(`Received message from user ${user.id}`);
    
    // add sender_id to message
    message.sender_id = user.id;

    var socketId = await redisClient.getAsync('connected_instance:' + message.instance_id);

    // if instance is not found
    if(socketId === null) {
      var notFound = new NotFoundError('NO_INSTANCE_FOUND');
      return callback(notFound.jsonError());
    }

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
  }

  async function handleNewMessageFromInstance(instance, message) {
    logger.debug(`New message from instance ${instance.id}`);
    
    // adding sending instance_id
    message.instance_id = instance.id;

    var socketId = await redisClient.getAsync('connected_user:' + message.user_id);

    if(socketId === null) {
      logger.debug(`User is not connected, not sending message`);
    } else {
      io.to(socketId).emit('message', message);
    }
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

  return {
    authenticateUser,
    disconnectUser,
    authenticateInstance,
    disconnectInstance,
    handleNewMessageFromUser,
    handleNewMessageFromInstance,
    hello
  };
};