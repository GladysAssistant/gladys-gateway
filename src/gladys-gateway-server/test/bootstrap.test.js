let databaseTask; let
  redisTask;
const should = require('should'); // eslint-disable-line no-unused-vars
require('./tasks/nock.js');
const Dotenv = require('dotenv');
const server = require('../core/index.js');
const DatabaseTask = require('./tasks/database.js');
const RedisTask = require('./tasks/redis.js');

before(async function Before() {
  this.timeout(10000);
  Dotenv.config();

  // we force this so JWT are always signed with the same secret in tests
  process.env.JWT_TWO_FACTOR_SECRET = 'twofactortesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttest';
  process.env.JWT_ACCESS_TOKEN_SECRET = 'accesstokentesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttest';
  process.env.JWT_REFRESH_TOKEN_SECRET = 'refreshtokentesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttest';
  process.env.POSTGRESQL_DATABASE = process.env.POSTGRESQL_DATABASE_TEST;

  // stripe disabled in tests
  delete process.env.STRIPE_SECRET_KEY;

  const { app, db, redisClient } = await server();
  databaseTask = DatabaseTask(db);
  redisTask = RedisTask(redisClient);
  global.TEST_BACKEND_APP = app;
});

after(() => {

});

beforeEach(function BeforeEach() {
  this.timeout(6000);
  return databaseTask.clean()
    .then(() => databaseTask.fill())
    .then(() => redisTask.clean())
    .then(() => redisTask.fill());
});

afterEach(() => {

});
