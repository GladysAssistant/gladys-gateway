const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../common/error');

module.exports = function AccessTokenAuthMiddleware(logger) {
  return async function AccessTokenAuth(req, res, next) {
    try {
      const decoded = jwt.verify(req.headers.authorization, process.env.JWT_ACCESS_TOKEN_SECRET, {
        issuer: 'gladys-gateway',
        audience: 'instance',
      });

      req.instance = {
        id: decoded.instance_id,
      };

      next();
    } catch (e) {
      logger.warn(e);
      throw new UnauthorizedError();
    }
  };
};
