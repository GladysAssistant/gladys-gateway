const { TooManyRequestsError } = require('../common/error');
const asyncMiddleware = require('./asyncMiddleware');
const {
  MAX_TEXT_REQUESTS,
  MAX_IMAGE_REQUESTS,
  hasImageInput,
  createOpenAILimiters,
} = require('../service/openAIRateLimit');

module.exports = function OpenAIAuthAndRateLimit(logger, redisClient, db) {
  const { textLimiter, imageLimiter } = createOpenAILimiters(redisClient);

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
    const hasImage = hasImageInput(req.body);
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
