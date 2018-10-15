const bodyParser = require('body-parser');
const asyncMiddleware = require('../middleware/asyncMiddleware.js');
const { NotFoundError } = require('../common/error.js');

module.exports.load = function(app, io, controllers, middlewares) {

  // the gateway is behing a proxy
  app.enable('trust proxy');

  // parse application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({
    extended: false
  }));

  // don't parse body of stripe webhook
  app.use('/stripe/webhook', bodyParser.raw({type: '*/*'}));

  // parse application/json
  app.use(bodyParser.json());

  // CORS
  app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    next();
  });

  app.options('/*', function(req, res, next) {
    res.sendStatus(200);
  });

  app.get('/ping', asyncMiddleware(controllers.pingController.ping));

  // user
  app.post('/users/signup', middlewares.rateLimiter, asyncMiddleware(controllers.userController.signup));
  app.post('/users/verify', middlewares.rateLimiter, asyncMiddleware(controllers.userController.confirmEmail));
  app.post('/users/login-salt', middlewares.rateLimiter, asyncMiddleware(controllers.userController.loginGetSalt));
  app.post('/users/login-generate-ephemeral', middlewares.rateLimiter, asyncMiddleware(controllers.userController.loginGenerateEphemeralValuePair));
  app.post('/users/login-finalize', middlewares.rateLimiter, asyncMiddleware(controllers.userController.loginDeriveSession));
  app.post('/users/login-two-factor', asyncMiddleware(middlewares.twoFactorTokenAuth), asyncMiddleware(controllers.userController.loginTwoFactor));
  
  app.post('/users/two-factor-configure', asyncMiddleware(middlewares.accessTokenAuth({ scope: 'two-factor-configure' })), asyncMiddleware(controllers.userController.configureTwoFactor));
  app.post('/users/two-factor-enable', asyncMiddleware(middlewares.accessTokenAuth({ scope: 'two-factor-configure' })), asyncMiddleware(controllers.userController.enableTwoFactor));

  app.patch('/users/me', asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })), asyncMiddleware(controllers.userController.updateUser));
  app.get('/users/me', asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })), asyncMiddleware(controllers.userController.getMySelf));
  app.get('/users/setup', asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })), asyncMiddleware(controllers.userController.getSetupState));

  app.get('/users/access-token', asyncMiddleware(middlewares.refreshTokenAuth), asyncMiddleware(controllers.userController.getAccessToken));

  app.post('/users/forgot-password', asyncMiddleware(controllers.userController.forgotPassword));
  app.post('/users/reset-password', asyncMiddleware(controllers.userController.resetPassword));

  // instance
  app.get('/instances', asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })), asyncMiddleware(controllers.instanceController.getInstances));
  app.post('/instances', asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })), asyncMiddleware(controllers.instanceController.createInstance));
  app.get('/instances/access-token', asyncMiddleware(middlewares.refreshTokenInstanceAuth), asyncMiddleware(controllers.instanceController.getAccessToken));
  app.get('/instances/users', asyncMiddleware(middlewares.accessTokenInstanceAuth), asyncMiddleware(controllers.instanceController.getUsers));
  app.get('/instances/:id', asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })), asyncMiddleware(controllers.instanceController.getInstanceById));

  // invitation
  app.post('/invitations', asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })), asyncMiddleware(controllers.invitationController.inviteUser));
  app.post('/invitations/accept', middlewares.rateLimiter, asyncMiddleware(controllers.invitationController.accept));

  // account
  app.get('/accounts/users', asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })), asyncMiddleware(controllers.accountController.getUsers));
  app.post('/accounts/subscribe', asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })), asyncMiddleware(controllers.accountController.subscribeMonthlyPlan));
  app.post('/stripe/webhook',  asyncMiddleware(controllers.accountController.stripeEvent));
  
  // socket
  io.on('connection', controllers.socketController.connection);

  // 404 error
  app.use(asyncMiddleware((req, res, next) => {
    throw new NotFoundError(`Route ${req.url} not found`);
  }));

  // error
  app.use(middlewares.errorMiddleware);
};