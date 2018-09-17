const bodyParser = require('body-parser');
const asyncMiddleware = require('../middleware/asyncMiddleware.js');

module.exports.load = function(app, controllers) {

  // parse application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({
    extended: false
  }));

  // parse application/json
  app.use(bodyParser.json());

  app.get('/ping', asyncMiddleware(controllers.pingController.ping));
};