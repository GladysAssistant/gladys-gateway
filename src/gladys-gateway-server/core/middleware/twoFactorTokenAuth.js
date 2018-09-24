const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../common/error');

module.exports = function (db, redisClient) {
  return async function(req, res, next) {
    try {
      var decoded = jwt.verify(req.headers.authorization, process.env.JWT_TWO_FACTOR_SECRET, {
        issuer: 'gladys-gateway'
      });
      req.user = {
        id: decoded.user_id
      };
      next();
    } catch(e) {
      console.log(e);
      throw new UnauthorizedError();
    }
  };
};