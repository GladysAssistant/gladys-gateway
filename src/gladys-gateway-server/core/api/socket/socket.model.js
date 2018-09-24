const jwt = require('jsonwebtoken');

module.exports = function SocketModel(logger, db, redisClient) {

  async function authenticateUser(accessToken){
    
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
    await redisClient.setAsync('connected_user:' + user.id, JSON.stringify(user));

    return user;
  }

  async function disconnectUser(user) {
    await redisClient.delAsync('connected_user:' + user.id);
  }

  async function authenticateInstance(accessToken) {
     
    // we decode the jwt and see if the access token is right
    var decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_TOKEN_SECRET, {
      issuer: 'gladys-gateway',
      audience: 'instance'
    });
    
    // we get the instance and his account_id
    var instance = await db.t_instance.findOne({
      id: decoded.instance_id
    }, {fields: ['id', 'account_id']});

    // we save in redis that the instance is connected
    await redisClient.setAsync('connected_instance:' + instance.id, JSON.stringify(instance));

    return instance;
  }

  async function disconnectInstance(instance) {
    await redisClient.delAsync('connected_instance:' + instance.id);
  }

  async function handleNewMessageFromUser(user, message, fn) {

  }

  async function handleNewMessageFromInstance(instance, message, fn) {
    
  }

  return {
    authenticateUser,
    disconnectUser,
    authenticateInstance,
    disconnectInstance,
    handleNewMessageFromUser,
    handleNewMessageFromInstance
  };
};