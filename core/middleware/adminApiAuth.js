const { RateLimiterRedis } = require('rate-limiter-flexible');

const { UnauthorizedError, TooManyRequestsError } = require('../common/error');
const asyncMiddleware = require('./asyncMiddleware');

if (!process.env.ADMIN_API_AUTHORIZATION_TOKEN) {
  throw new Error('ADMIN_API_AUTHORIZATION_TOKEN is not defined');
}

if (process.env.ADMIN_API_AUTHORIZATION_TOKEN.length < 64) {
  throw new Error('ADMIN_API_AUTHORIZATION_TOKEN should be with a length of at least 64');
}

const MAX_FAILS = 5;

module.exports = function AdminApiAuth(logger, redisClient) {
  const limiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rate_limit:admin_api_auth',
    points: MAX_FAILS, // fails per 24 hours
    duration: 24 * 60 * 60, // 24 hour
  });
  return asyncMiddleware(async (req, res, next) => {
    // we check if the current ip is rate limited
    const limiterResult = await limiter.get(req.ip);
    if (limiterResult && limiterResult.consumedPoints > MAX_FAILS) {
      logger.warn(`AdminApiAuth: Client ${req.ip} has been querying too much this route`);
      throw new TooManyRequestsError('Too many requests.');
    }

    // if authorization header is good, we go to the next middleware
    const { authorization } = req.header('Authorization');
    if (authorization === process.env.ADMIN_API_AUTHORIZATION_TOKEN) {
      logger.info(`Admin API request`);
      return next();
    }

    // if it's wrong, we consume one credit
    try {
      await limiter.consume(req.ip);
    } catch (e) {
      logger.warn(`AdminApiAuth: Client ${req.ip} has been querying too much this route`);
      logger.warn(e);
      throw new TooManyRequestsError('Too many requests.');
    }

    throw new UnauthorizedError();
  });
};
