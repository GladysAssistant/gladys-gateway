const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../common/error');
const crypto = require('crypto');

module.exports = function (logger) {
  return async function(req, res, next) {
    try {
      
      var decoded = jwt.verify(req.headers.authorization, process.env.JWT_REFRESH_TOKEN_SECRET, {
        audience: 'user',
        issuer: 'gladys-gateway'
      });

      var userAgentHash = crypto.createHash('sha256').update(req.headers['user-agent']).digest('base64');

      if(decoded.fingerprint !== userAgentHash) {
        throw new Error('User agent has changed, user not authorized');
      }

      req.user = {
        id: decoded.user_id
      };

      next();
    } catch(e) {
      logger.warn(e);
      throw new UnauthorizedError();
    }
  };
};