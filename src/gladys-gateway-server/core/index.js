module.exports = async () => {
  const Promise = require('bluebird');
  const express = require('express');
  const massive = require('massive');
  const redis = require('redis');
  Promise.promisifyAll(redis);
  
  const logger = require('tracer').colorConsole({
    level: process.env.LOG_LEVEL || 'debug'
  });

  const app = express();
  const server = require('http').Server(app);
  const io = require('socket.io')(server);
  const redisAdapter = require('socket.io-redis');

  io.adapter(redisAdapter({ 
    host: process.env.REDIS_HOST, 
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
  }));

  const redisClient = redis.createClient({
    host: process.env.REDIS_HOST, 
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
  });

  const db = await massive({
    host: process.env.POSTGRESQL_HOST,
    port: process.env.POSTGRESQL_PORT,
    database: process.env.POSTGRESQL_DATABASE,
    user: process.env.POSTGRESQL_USER,
    password: process.env.POSTGRESQL_PASSWORD
  });

  const services = {
    fingerprint: require('./service/fingerprint')(logger),
    mailgunService: require('./service/mailgun')(logger),
    jwtService: require('./service/jwt')(),
    stripeService: require('./service/stripe')(logger),
    slackService: require('./service/slack')(logger),
    selzService:  require('./service/selz')(logger),
  };

  const models = {
    pingModel: require('./api/ping/ping.model')(logger, db, redisClient),
    userModel: require('./api/user/user.model')(logger, db, redisClient, services.jwtService, services.mailgunService),
    socketModel: require('./api/socket/socket.model')(logger, db, redisClient, io, services.fingerprint),
    instanceModel: require('./api/instance/instance.model')(logger, db, redisClient, services.jwtService, services.fingerprint),
    invitationModel: require('./api/invitation/invitation.model')(logger, db, redisClient, services.mailgunService),
    accountModel: require('./api/account/account.model')(logger, db, redisClient, services.stripeService, services.mailgunService, services.selzService, services.slackService),
    deviceModel: require('./api/device/device.model')(logger, db, redisClient)
  };

  const controllers = {
    pingController: require('./api/ping/ping.controller')(models.pingModel),
    userController: require('./api/user/user.controller')(models.userModel, services.mailgunService, models.socketModel),
    socketController: require('./api/socket/socket.controller')(logger, models.socketModel, io),
    instanceController: require('./api/instance/instance.controller')(models.instanceModel, models.socketModel),
    invitationController: require('./api/invitation/invitation.controller')(models.invitationModel),
    accountController: require('./api/account/account.controller')(models.accountModel, models.socketModel),
    deviceController: require('./api/device/device.controller')(models.deviceModel),
  };

  const middlewares = {
    twoFactorTokenAuth: require('./middleware/twoFactorTokenAuth')(db, redisClient),
    accessTokenAuth: require('./middleware/accessTokenAuth')(logger),
    refreshTokenAuth: require('./middleware/refreshTokenAuth')(logger),
    refreshTokenInstanceAuth: require('./middleware/refreshTokenInstanceAuth')(logger),
    accessTokenInstanceAuth: require('./middleware/accessTokenInstanceAuth')(logger),
    errorMiddleware: require('./middleware/errorMiddleware.js'),
    rateLimiter: require('./middleware/rateLimiter')(redisClient)
  };
  

  const routes = require('./api/routes');

  routes.load(app, io, controllers, middlewares);

  server.listen(process.env.SERVER_PORT);

  return {
    app,
    io,
    db, 
    redisClient,
    models,
    controllers
  };
};