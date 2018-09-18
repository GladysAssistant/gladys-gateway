const bodyParser = require('body-parser');
const asyncMiddleware = require('../middleware/asyncMiddleware.js');
const errorMiddleware = require('../middleware/errorMiddleware.js');
const { NotFoundError } = require('../common/error.js');

module.exports.load = function(app, controllers) {

  // parse application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({
    extended: false
  }));

  // parse application/json
  app.use(bodyParser.json());

  app.get('/ping', asyncMiddleware(controllers.pingController.ping));

  // user
  app.post('/signup', asyncMiddleware(controllers.userController.signup));
  app.post('/users/verify', asyncMiddleware(controllers.userController.confirmEmail));

  // 404 error
  app.use(asyncMiddleware((req, res, next) => {
    throw new NotFoundError(`Route ${req.url} not found`);
  }));

  // error
  app.use(errorMiddleware);
};