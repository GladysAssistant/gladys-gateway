const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../common/error');

module.exports = function RefreshTokenAuthMiddleware(logger) {
  return async function RefreshTokenAuth(req, res, next) {
    try {
      const decoded = jwt.verify(req.headers.authorization, process.env.JWT_REFRESH_TOKEN_SECRET, {
        audience: 'user',
        issuer: 'gladys-gateway',
      });

      req.user = {
        id: decoded.user_id,
      };

      next();
    } catch (e) {
      throw new UnauthorizedError();
    }
  };
};
