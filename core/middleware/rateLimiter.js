const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const asyncMiddleware = require('./asyncMiddleware.js');

const MAX_REQUEST_PER_HOUR = 100;

module.exports = function RateLimiterMiddleware(redisClient) {
  return asyncMiddleware(
    rateLimit({
      max: MAX_REQUEST_PER_HOUR, // limit each IP to 100 requests per window
      delayMs: 0, // disable delaying - full speed until the max limit is reached
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
      }),
    }),
  );
};
