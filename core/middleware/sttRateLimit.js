const { RateLimiterRedis } = require('rate-limiter-flexible');

const { TooManyRequestsError } = require('../common/error');
const asyncMiddleware = require('./asyncMiddleware');

const MAX_REQUESTS = parseInt(process.env.STT_MAX_REQUESTS_PER_MONTH_PER_ACCOUNT, 10);

module.exports = function STTRateLimit(logger, redisClient, db) {
  const limiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rate_limit:stt_api',
    points: MAX_REQUESTS,
    duration: 30 * 24 * 60 * 60, // 30 days
  });
  return asyncMiddleware(async (req, res, next) => {
    const instanceWithAccount = await db.t_account
      .join({
        t_instance: {
          type: 'INNER',
          on: {
            account_id: 'id',
          },
        },
      })
      .findOne({
        't_instance.id': req.instance.id,
      });
    const uniqueIdentifier = instanceWithAccount.id;
    const limiterResult = await limiter.get(uniqueIdentifier);
    if (limiterResult && limiterResult.consumedPoints > MAX_REQUESTS) {
      logger.warn(`STT Rate limit: Account ${uniqueIdentifier} has been querying too much this route`);
      throw new TooManyRequestsError('Too many requests this month.');
    }

    try {
      await limiter.consume(uniqueIdentifier);
    } catch (e) {
      logger.warn(`STT Rate limit: Account ${uniqueIdentifier} has been querying too much this route`);
      logger.warn(e);
      throw new TooManyRequestsError('Too many requests this month.');
    }

    next();
  });
};
