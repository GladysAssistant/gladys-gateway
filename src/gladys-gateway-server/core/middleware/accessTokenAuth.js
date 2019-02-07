const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../common/error');

module.exports = function AccessTokenAuthMiddleware(logger) {
  return function AccessTokenAuthMiddlewareGenerator({ scope }) {
    return async function AccessTokenAuth(req, res, next) {
      try {
        const decoded = jwt.verify(req.headers.authorization, process.env.JWT_ACCESS_TOKEN_SECRET, {
          issuer: 'gladys-gateway',
          audience: 'user',
        });

        if (decoded.scope.includes(scope) === false) {
          throw new Error(`AccessTokenAuth: Scope "${scope}" is not in list of authorized scope ${decoded.scope}`);
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
};
