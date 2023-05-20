const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../common/error');

module.exports = function TwoFactorTokenAuthMiddleware(db, redisClient) {
  return async function TwoFactorTokenAuth(req, res, next) {
    try {
      const decoded = jwt.verify(req.header('Authorization'), process.env.JWT_TWO_FACTOR_SECRET, {
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
