var databaseTask, redisTask;

before(async function() {
  require('dotenv').config();
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