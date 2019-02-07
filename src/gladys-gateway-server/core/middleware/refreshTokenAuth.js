const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { UnauthorizedError } = require('../common/error');

module.exports = function RefreshTokenAuthMiddleware(logger) {
  return async function RefreshTokenAuth(req, res, next) {
    try {
      const decoded = jwt.verify(req.headers.authorization, process.env.JWT_REFRESH_TOKEN_SECRET, {
        audience: 'user',
        issuer: 'gladys-gateway',
      });

      const userAgentHash = crypto.createHash('sha256').update(req.headers['user-agent']).digest('hex');

      if (decoded.fingerprint !== userAgentHash) {
        throw new Error('User agent has changed, user not authorized');
      }

      req.user = {
        id: decoded.user_id,
      };

      next();
    } catch (e) {
      throw new UnauthorizedError();
    }
  };
};
