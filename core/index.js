const Promise = require('bluebird');
const express = require('express');
const massive = require('massive');
const redis = require('redis');
const tracer = require('tracer');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');

// Services
const Fingerprint = require('./service/fingerprint');
const Mail = require('./service/mail');
const Jwt = require('./service/jwt');
const Stripe = require('./service/stripe');
const Slack = require('./service/slack');
const Telegram = require('./service/telegram');
const AnalyticsService = require('./service/analytics');

// Models
const Ping = require('./api/ping/ping.model');
const User = require('./api/user/user.model');
const Socket = require('./api/socket/socket.model');
const Instance = require('./api/instance/instance.model');
const Invitation = require('./api/invitation/invitation.model');
const Account = require('./api/account/account.model');
const Device = require('./api/device/device.model');
const Admin = require('./api/admin/admin.models');
const OpenApi = require('./api/openapi/openapi.model.js');
const Version = require('./api/version/version.model.js');
const Backup = require('./api/backup/backup.model');
const StatModel = require('./api/stat/stat.model.js');
const GoogleModel = require('./api/google/google.model.js');
const AlexaModel = require('./api/alexa/alexa.model.js');
const EnedisModel = require('./api/enedis/enedis.model');

// Controllers
const PingController = require('./api/ping/ping.controller');
const UserController = require('./api/user/user.controller');
const SocketController = require('./api/socket/socket.controller');
const InstanceController = require('./api/instance/instance.controller');
const InvitationController = require('./api/invitation/invitation.controller');
const AccountController = require('./api/account/account.controller');
const DeviceController = require('./api/device/device.controller');
const AdminController = require('./api/admin/admin.controller');
const OpenApiController = require('./api/openapi/openapi.controller');
const VersionController = require('./api/version/version.controller');
const BackupController = require('./api/backup/backup.controller');
const StatController = require('./api/stat/stat.controller');
const GoogleController = require('./api/google/google.controller');
const AlexaController = require('./api/alexa/alexa.controller');
const EnedisController = require('./api/enedis/enedis.controller');

// Middlewares
const TwoFactorAuthMiddleware = require('./middleware/twoFactorTokenAuth');
const AccessTokenAuthMiddleware = require('./middleware/accessTokenAuth');
const RefreshTokenAuthMiddleware = require('./middleware/refreshTokenAuth');
const RefreshTokenInstanceAuthMiddleware = require('./middleware/refreshTokenInstanceAuth');
const AccessTokenInstanceAuthMiddleware = require('./middleware/accessTokenInstanceAuth');
const ErrorMiddleware = require('./middleware/errorMiddleware.js');
const RateLimiterMiddleware = require('./middleware/rateLimiter');
const IsSuperAdminMiddleware = require('./middleware/isSuperAdmin');
const OpenApiKeyAuthMiddleware = require('./middleware/openApiApiKeyAuth');
const gladysUsageMiddleware = require('./middleware/gladysUsage');
const requestExecutionTime = require('./middleware/requestExecutionTime');
const AdminApiAuth = require('./middleware/adminApiAuth');

// Routes
const routes = require('./api/routes');

module.exports = async (port) => {
  Promise.promisifyAll(redis);

  const logger = tracer.colorConsole({
    level: process.env.LOG_LEVEL || 'debug',
  });

  const app = express();
  app.enable('trust proxy');
  const server = createServer(app);

  const io = new Server(server, {
    allowEIO3: true,
    maxHttpBufferSize: 25 * 1024 * 1024, // 25 MB
    cors: {
      origin: '*',
      methods: ['GET', 'HEAD', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    },
  });

  const redisClient = redis.createClient({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  });

  const subClient = redisClient.duplicate();

  io.adapter(createAdapter(redisClient, subClient, { requestsTimeout: 15000 }));

  const dbOptions = {
    host: process.env.POSTGRESQL_HOST,
    port: process.env.POSTGRESQL_PORT,
    database: process.env.POSTGRESQL_DATABASE,
    user: process.env.POSTGRESQL_USER,
    password: process.env.POSTGRESQL_PASSWORD,
  };

  if (process.env.POSTGRESQL_SSL) {
    dbOptions.ssl = {
      rejectUnauthorized: false,
    };
  }

  const db = await massive(dbOptions);

  const services = {
    fingerprint: Fingerprint(logger),
    mailService: Mail(logger),
    jwtService: Jwt(),
    stripeService: Stripe(logger),
    slackService: Slack(logger),
    telegramService: Telegram(logger),
    analyticsService: AnalyticsService(logger),
  };

  const models = {
    pingModel: Ping(logger, db, redisClient),
    userModel: User(logger, db, redisClient, services.jwtService, services.mailService),
    socketModel: Socket(logger, db, redisClient, io, services.fingerprint, services.analyticsService),
    instanceModel: Instance(logger, db, redisClient, services.jwtService, services.fingerprint),
    invitationModel: Invitation(logger, db, redisClient, services.mailService, services.telegramService),
    accountModel: Account(
      logger,
      db,
      redisClient,
      services.stripeService,
      services.mailService,
      services.telegramService,
    ),
    deviceModel: Device(logger, db, redisClient),
    adminModel: Admin(logger, db, redisClient, services.mailService, services.slackService, services.stripeService),
    openApiModel: OpenApi(logger, db),
    versionModel: Version(logger, db),
    backupModel: Backup(logger, db),
    statModel: StatModel(logger, db, redisClient),
    googleModel: GoogleModel(logger, db, redisClient, services.jwtService),
    alexaModel: AlexaModel(logger, db, redisClient, services.jwtService),
    enedisModel: EnedisModel(logger, db, redisClient),
  };

  const controllers = {
    pingController: PingController(models.pingModel),
    userController: UserController(models.userModel, services.mailService, models.socketModel),
    socketController: SocketController(logger, models.socketModel, io, models.instanceModel),
    instanceController: InstanceController(models.instanceModel, models.socketModel),
    invitationController: InvitationController(models.invitationModel),
    accountController: AccountController(models.accountModel, models.socketModel),
    deviceController: DeviceController(models.deviceModel),
    adminController: AdminController(models.adminModel),
    openApiController: OpenApiController(models.openApiModel, models.socketModel),
    versionController: VersionController(models.versionModel),
    backupController: BackupController(models.backupModel, models.accountModel, logger),
    statController: StatController(models.statModel),
    googleController: GoogleController(
      logger,
      models.googleModel,
      models.socketModel,
      models.instanceModel,
      models.userModel,
      models.deviceModel,
      services.analyticsService,
    ),
    alexaController: AlexaController(
      logger,
      models.alexaModel,
      models.socketModel,
      models.instanceModel,
      models.userModel,
      models.deviceModel,
      services.analyticsService,
    ),
    enedisController: EnedisController(logger, models.enedisModel),
  };

  const middlewares = {
    twoFactorTokenAuth: TwoFactorAuthMiddleware(db, redisClient),
    accessTokenAuth: AccessTokenAuthMiddleware(logger),
    refreshTokenAuth: RefreshTokenAuthMiddleware(logger),
    refreshTokenInstanceAuth: RefreshTokenInstanceAuthMiddleware(logger),
    accessTokenInstanceAuth: AccessTokenInstanceAuthMiddleware(logger),
    errorMiddleware: ErrorMiddleware(logger),
    rateLimiter: RateLimiterMiddleware(redisClient),
    isSuperAdmin: IsSuperAdminMiddleware(logger),
    openApiKeyAuth: OpenApiKeyAuthMiddleware(models.openApiModel, models.userModel, models.instanceModel),
    gladysUsage: gladysUsageMiddleware(logger, db),
    requestExecutionTime: requestExecutionTime(logger, services.analyticsService),
    adminApiAuth: AdminApiAuth(logger, redisClient),
  };

  routes.load(app, io, controllers, middlewares);

  server.listen(port);

  return {
    app,
    io,
    db,
    redisClient,
    models,
    controllers,
  };
};