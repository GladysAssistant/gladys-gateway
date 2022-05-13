const { UnauthorizedError } = require('../common/error');
const asyncMiddleware = require('./asyncMiddleware.js');

if (!process.env.ADMIN_API_AUTHORIZATION_TOKEN) {
  throw new Error('ADMIN_API_AUTHORIZATION_TOKEN is not defined');
}

if (process.env.ADMIN_API_AUTHORIZATION_TOKEN.length < 64) {
  throw new Error('ADMIN_API_AUTHORIZATION_TOKEN should be with a length of at least 64');
}

module.exports = function AdminApiAuth(logger) {
  return asyncMiddleware((req, res, next) => {
    const { authorization } = req.headers;
    if (!authorization || authorization === '') {
      throw new UnauthorizedError();
    }
    if (authorization === process.env.ADMIN_API_AUTHORIZATION_TOKEN) {
      logger.info(`Admin API request`);
      return next();
    }

    throw new UnauthorizedError();
  });
};
