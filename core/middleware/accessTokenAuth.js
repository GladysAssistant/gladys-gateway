const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../common/error');

module.exports = function AccessTokenAuthMiddleware(logger) {
  return function AccessTokenAuthMiddlewareGenerator({ scope, audience = 'user' }) {
    return async function AccessTokenAuth(req, res, next) {
      try {
        let jwtToken = req.headers.authorization;
        if (jwtToken.startsWith('Bearer ')) {
          jwtToken = jwtToken.substr(7);
        }
        const decoded = jwt.verify(jwtToken, process.env.JWT_ACCESS_TOKEN_SECRET, {
          algorithms: ['HS256'],
          issuer: 'gladys-gateway',
          audience,
        });

        if (decoded.scope.includes(scope) === false) {
          throw new Error(`AccessTokenAuth: Scope "${scope}" is not in list of authorized scope ${decoded.scope}`);
        }

        req.user = {
          id: decoded.user_id,
        };

        if (decoded.device_id) {
          req.device = {
            id: decoded.device_id,
          };
        }

        next();
      } catch (e) {
        // never log the token itself, only why it was rejected
        logger.debug(`AccessTokenAuth: ${e.message}`);
        throw new UnauthorizedError();
      }
    };
  };
};
