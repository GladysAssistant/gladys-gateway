const { RateLimiterRedis } = require('rate-limiter-flexible');

const { ForbiddenError, TooManyRequestsError } = require('../common/error');
const asyncMiddleware = require('./asyncMiddleware');

const MAX_TEXT_REQUESTS = parseInt(process.env.OPEN_AI_MAX_TEXT_REQUESTS_PER_MONTH_PER_ACCOUNT, 10);
const MAX_IMAGE_REQUESTS = parseInt(process.env.OPEN_AI_MAX_IMAGE_REQUESTS_PER_MONTH_PER_ACCOUNT, 10);

module.exports = function OpenAIAuthAndRateLimit(logger, redisClient, db) {
  const textLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rate_limit:open_ai:text',
    points: MAX_TEXT_REQUESTS, // max text requests per month
    duration: 30 * 24 * 60 * 60, // 30 days
  });
  const imageLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rate_limit:open_ai:image',
    points: MAX_IMAGE_REQUESTS, // max image requests per month
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
    if (instanceWithAccount.status !== 'active') {
      throw new ForbiddenError('Account license should be active');
    }
    const uniqueIdentifier = instanceWithAccount.id;
    const hasImage = req.body && req.body.image;
    const limiter = hasImage ? imageLimiter : textLimiter;
    const maxRequests = hasImage ? MAX_IMAGE_REQUESTS : MAX_TEXT_REQUESTS;
    const requestType = hasImage ? 'image' : 'text';

    // we check if the current account is rate limited
    const limiterResult = await limiter.get(uniqueIdentifier);
    if (limiterResult && limiterResult.consumedPoints > maxRequests) {
      logger.warn(
        `OpenAI Rate limit: Account ${uniqueIdentifier} has been querying too much this route (${requestType})`,
      );
      throw new TooManyRequestsError(`Too many ${requestType} requests this month.`);
    }

    // We consume one credit
    try {
      await limiter.consume(uniqueIdentifier);
    } catch (e) {
      logger.warn(
        `OpenAI Rate limit: Account ${uniqueIdentifier} has been querying too much this route (${requestType})`,
      );
      logger.warn(e);
      throw new TooManyRequestsError(`Too many ${requestType} requests this month.`);
    }

    next();
  });
};
