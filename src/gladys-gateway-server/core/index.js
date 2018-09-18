module.exports = async () => {
  const express = require('express');
  const massive = require('massive');
  const redis = require('redis');
  const Promise = require('bluebird');
  Promise.promisifyAll(redis);

  const app = express();

  const db = await massive({
    host: process.env.POSTGRESQL_HOST,
    //port: process.env.POSTGRESQL_PORT,
    database: process.env.POSTGRESQL_DATABASE,
    user: process.env.POSTGRESQL_USER,
    //password: process.env.POSTGRESQL_PASSWORD || ''
  });

  const redisClient = redis.createClient();

  const models = {
    pingModel: require('./api/ping/ping.model')(db, redisClient),
    userModel: require('./api/user/user.model')(db, redisClient)
  };

  const controllers = {
    pingController: require('./api/ping/ping.controller')(models.pingModel),
    userController: require('./api/user/user.controller')(models.userModel)
  };

  const routes = require('./api/routes');

  routes.load(app, controllers);

  app.listen(process.env.SERVER_PORT);

  return {
    app,
    db, 
    redisClient,
    models,
    controllers
  };
};