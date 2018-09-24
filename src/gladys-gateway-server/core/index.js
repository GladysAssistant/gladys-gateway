module.exports = async () => {
  const Promise = require('bluebird');
  const express = require('express');
  const massive = require('massive');
  const redis = require('redis');
  Promise.promisifyAll(redis);
  const logger = require('tracer').colorConsole();

  const app = express();
  const server = require('http').Server(app);
  const io = require('socket.io')(server);
  const redisAdapter = require('socket.io-redis');

  io.adapter(redisAdapter({ 
    host: process.env.REDIS_HOST, 
    port: process.env.REDIS_PORT
  }));

  const redisClient = redis.createClient();

  const db = await massive({
    host: process.env.POSTGRESQL_HOST,
    port: process.env.POSTGRESQL_PORT,
    database: process.env.POSTGRESQL_DATABASE,
    user: process.env.POSTGRESQL_USER,
    password: process.env.POSTGRESQL_PASSWORD
  });

  const services = {
    mailgunService: require('./service/mailgun')(logger),
    jwtService: require('./service/jwt')()
  };

  const models = {
    pingModel: require('./api/ping/ping.model')(logger, db, redisClient),
    userModel: require('./api/user/user.model')(logger, db, redisClient, services.jwtService),
    socketModel: require('./api/socket/socket.model')(logger, db, redisClient),
    instanceModel: require('./api/instance/instance.model')(logger, db, redisClient, services.jwtService)
  };

  const controllers = {
    pingController: require('./api/ping/ping.controller')(models.pingModel),
    userController: require('./api/user/user.controller')(models.userModel, services.mailgunService),
    socketController: require('./api/socket/socket.controller')(logger, models.socketModel),
    instanceController: require('./api/instance/instance.controller')(models.instanceModel)
  };

  const middlewares = {
    twoFactorTokenAuth: require('./middleware/twoFactorTokenAuth')(db, redisClient),
    accessTokenAuth: require('./middleware/accessTokenAuth')(logger),
    refreshTokenAuth: require('./middleware/refreshTokenAuth')(logger),
    errorMiddleware: require('./middleware/errorMiddleware.js')
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