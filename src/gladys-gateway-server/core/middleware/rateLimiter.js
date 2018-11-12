const rateLimit = require('express-rate-limit');
const asyncMiddleware = require('./asyncMiddleware.js');
const RedisStore = require('rate-limit-redis');

const MAX_REQUEST_PER_HOUR = 10000;

module.exports = function(redisClient) {

  return asyncMiddleware(rateLimit({
    max: MAX_REQUEST_PER_HOUR, // limit each IP to 100 requests per window
    delayMs: 0, // disable delaying - full speed until the max limit is reached
    store: new RedisStore({
      expiry:  60 * 60,
      prefix: 'rate-limit:',
      client: redisClient
    }),
  }));
};