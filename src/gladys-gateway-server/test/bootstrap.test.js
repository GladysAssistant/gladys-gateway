var databaseTask, redisTask;
var should = require('should'); // eslint-disable-line no-unused-vars

before(async function() {
  this.timeout(10000);
  require('dotenv').config();
  require('./tasks/nock.js');
  
  // we force this so JWT are always signed with the same secret in tests
  process.env.JWT_TWO_FACTOR_SECRET = 'twofactortesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttest';
  process.env.JWT_ACCESS_TOKEN_SECRET = 'accesstokentesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttest';
  process.env.JWT_REFRESH_TOKEN_SECRET = 'refreshtokentesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttest';
  process.env.POSTGRESQL_DATABASE = process.env.POSTGRESQL_DATABASE_TEST;

  // stripe disabled in tests
  delete process.env.STRIPE_SECRET_KEY;
  
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