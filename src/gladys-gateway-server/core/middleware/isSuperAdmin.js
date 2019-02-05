const { UnauthorizedError } = require('../common/error');
const asyncMiddleware = require('./asyncMiddleware.js');

module.exports = function IsSuperAdmin(logger) {
  return asyncMiddleware((req, res, next) => {
    if (req.user && req.user.id === process.env.SUPER_ADMIN_USER_ID) {
      logger.info(`Super Admin sending request`);
      return next();
    }

    throw new UnauthorizedError();
  });
};
