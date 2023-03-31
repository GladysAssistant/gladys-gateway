let databaseTask;
let redisTask;
const should = require('should'); // eslint-disable-line no-unused-vars
require('./tasks/nock');
const Dotenv = require('dotenv');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

Dotenv.config();

const server = require('../core/index');
const DatabaseTask = require('./tasks/database');
const RedisTask = require('./tasks/redis');

chai.use(chaiAsPromised);

before(async function Before() {
  this.timeout(10000);

  // we force this so JWT are always signed with the same secret in tests
  process.env.JWT_TWO_FACTOR_SECRET =
    'twofactortesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttest';
  process.env.JWT_ACCESS_TOKEN_SECRET =
    'accesstokentesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttest';
  process.env.JWT_REFRESH_TOKEN_SECRET =
    'refreshtokentesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttesttest';
  process.env.GOOGLE_HOME_ACCOUNT_PRIVATE_KEY =
    '-----BEGIN RSA PRIVATE KEY-----\n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\n-----END RSA PRIVATE KEY-----';
  process.env.POSTGRESQL_DATABASE = process.env.POSTGRESQL_DATABASE_TEST;
  process.env.STRIPE_SECRET_KEY = 'test';
  process.env.OPEN_AI_MAX_REQUESTS_PER_MONTH_PER_ACCOUNT = 100;

  // starting 2 backends to try multi-server socket exchange
  const { io, app, db, redisClient, legacyRedisClient } = await server(process.env.SERVER_PORT);
  const { io: iosServer2, app: appServer2 } = await server(process.env.SERVER_PORT + 1);
  databaseTask = DatabaseTask(db);
  redisTask = RedisTask(redisClient);
  global.TEST_BACKEND_APP = app;
  global.TEST_BACKEND_APP_2 = appServer2;
  global.TEST_IO = io;
  global.TEST_IO_SERVER_2 = iosServer2;
  global.TEST_DATABASE_INSTANCE = db;
  global.TEST_LEGACY_REDIS_CLIENT = legacyRedisClient;
});

beforeEach(async function BeforeEach() {
  this.timeout(6000);
  await databaseTask.clean();
  await databaseTask.fill();
  await redisTask.clean();
  await redisTask.fill();
  // Disconnecting all websockets clients between each tests
  TEST_IO.disconnectSockets();
  TEST_IO_SERVER_2.disconnectSockets();
});

afterEach(() => {});
