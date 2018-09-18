var databaseTask, redisTask;
var should = require('should'); // eslint-disable-line no-unused-vars

before(async function() {
  require('dotenv').config();
  //console.log(process.env.POSTGRESQL_HOST + ' ' +process.env.POSTGRESQL_DATABASE + ' ' + process.env.POSTGRESQL_USER);
  const {app, db, redisClient} = await require('../core/index.js')();
  databaseTask = require('./tasks/database.js')(db);
  redisTask = require('./tasks/redis.js')(redisClient);
  global.TEST_BACKEND_APP = app;
});

after(function() {

});

beforeEach(function() {
  this.timeout(6000);
  return databaseTask.clean()
    .then(() => databaseTask.fill())
    .then(() => redisTask.clean())
    .then(() => redisTask.fill());
});

afterEach(function() {

});