const Promise = require('bluebird');
const express = require('express');
const massive = require('massive');
const redis = require('redis');
const tracer = require('tracer');
const http = require('http');
const socketIo = require('socket.io');
const redisAdapter = require('socket.io-redis');

// Services
const Fingerprint = require('./service/fingerprint');
const Mailgun = require('./service/mailgun');
const Jwt = require('./service/jwt');
const Stripe = require('./service/stripe');
const Slack = require('./service/slack');
const Selz = require('./service/selz');
const Keen = require('./service/keen');

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

// Routes
const routes = require('./api/routes');

module.exports = async () => {
  Promise.promisifyAll(redis);

  const logger = tracer.colorConsole({
    level: process.env.LOG_LEVEL || 'debug',
  });
  const app = express();
  const server = http.Server(app);
  const io = socketIo(server);

  io.adapter(redisAdapter({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  }));

  const redisClient = redis.createClient({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  });

  const db = await massive({
    host: process.env.POSTGRESQL_HOST,
    port: process.env.POSTGRESQL_PORT,
    database: process.env.POSTGRESQL_DATABASE,
    user: process.env.POSTGRESQL_USER,
    password: process.env.POSTGRESQL_PASSWORD,
  });

  const services = {
    fingerprint: Fingerprint(logger),
    mailgunService: Mailgun(logger),
    jwtService: Jwt(),
    stripeService: Stripe(logger),
    slackService: Slack(logger),
    selzService: Selz(logger),
    statsService: Keen(logger),
  };

  const models = {
    pingModel: Ping(logger, db, redisClient),
    userModel: User(logger, db, redisClient, services.jwtService, services.mailgunService),
    socketModel: Socket(logger, db, redisClient, io, services.fingerprint, services.statsService),
    instanceModel: Instance(logger, db, redisClient, services.jwtService, services.fingerprint),
    invitationModel: Invitation(logger, db, redisClient, services.mailgunService),
    accountModel: Account(logger, db, redisClient, services.stripeService,
      services.mailgunService, services.selzService, services.slackService),
    deviceModel: Device(logger, db, redisClient),
    adminModel: Admin(logger, db, redisClient, services.mailgunService,
      services.selzService, services.slackService),
    openApiModel: OpenApi(logger, db),
  };

  const controllers = {
    pingController: PingController(models.pingModel),
    userController: UserController(models.userModel, services.mailgunService, models.socketModel),
    socketController: SocketController(logger, models.socketModel, io),
    instanceController: InstanceController(models.instanceModel, models.socketModel),
    invitationController: InvitationController(models.invitationModel),
    accountController: AccountController(models.accountModel, models.socketModel),
    deviceController: DeviceController(models.deviceModel),
    adminController: AdminController(models.adminModel),
    openApiController: OpenApiController(models.openApiModel, models.socketModel),
  };

  const middlewares = {
    twoFactorTokenAuth: TwoFactorAuthMiddleware(db, redisClient),
    accessTokenAuth: AccessTokenAuthMiddleware(logger),
    refreshTokenAuth: RefreshTokenAuthMiddleware(logger),
    refreshTokenInstanceAuth: RefreshTokenInstanceAuthMiddleware(logger),
    accessTokenInstanceAuth: AccessTokenInstanceAuthMiddleware(logger),
    errorMiddleware: ErrorMiddleware,
    rateLimiter: RateLimiterMiddleware(redisClient),
    isSuperAdmin: IsSuperAdminMiddleware(logger),
    openApiKeyAuth: OpenApiKeyAuthMiddleware(models.openApiModel, models.userModel,
      models.instanceModel, services.statsService),
  };

  routes.load(app, io, controllers, middlewares);

  server.listen(process.env.SERVER_PORT);

  return {
    app,
    io,
    db,
    redisClient,
    models,
    controllers,
  };
};
