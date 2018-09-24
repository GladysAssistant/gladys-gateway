const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../common/error');

module.exports = function (logger) {
  return async function(req, res, next) {
    try {
      
      var decoded = jwt.verify(req.headers.authorization, process.env.JWT_REFRESH_TOKEN_SECRET, {
        audience: 'instance',
        issuer: 'gladys-gateway'
      });

      req.instance = {
        id: decoded.instance_id
      };

      next();
    } catch(e) {
      logger.warn(e);
      throw new UnauthorizedError();
    }
  };
};