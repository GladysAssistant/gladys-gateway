const { RateLimiterRedis } = require('rate-limiter-flexible');

const RATE_LIMIT_DURATION_SECONDS = 30 * 24 * 60 * 60;

const TEXT_KEY_PREFIX = 'rate_limit:open_ai:text';
const IMAGE_KEY_PREFIX = 'rate_limit:open_ai:image';

function getMaxTextRequests() {
  return parseInt(process.env.OPEN_AI_MAX_TEXT_REQUESTS_PER_MONTH_PER_ACCOUNT, 10);
}

function getMaxImageRequests() {
  return parseInt(process.env.OPEN_AI_MAX_IMAGE_REQUESTS_PER_MONTH_PER_ACCOUNT, 10);
}

function messageContainsImageContent(message) {
  if (!message || !message.content) {
    return false;
  }
  if (!Array.isArray(message.content)) {
    return false;
  }
  return message.content.some((contentPart) => {
    if (!contentPart || typeof contentPart !== 'object') {
      return false;
    }
    return contentPart.type === 'image_url' || contentPart.type === 'input_image' || !!contentPart.image_url;
  });
}

function hasImageInput(data) {
  if (data && data.image) {
    return true;
  }
  if (!data || !Array.isArray(data.messages)) {
    return false;
  }
  return data.messages.some(messageContainsImageContent);
}

function createOpenAILimiters(redisClient) {
  const textLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: TEXT_KEY_PREFIX,
    points: getMaxTextRequests(),
    duration: RATE_LIMIT_DURATION_SECONDS,
  });
  const imageLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: IMAGE_KEY_PREFIX,
    points: getMaxImageRequests(),
    duration: RATE_LIMIT_DURATION_SECONDS,
  });

  return { textLimiter, imageLimiter };
}

async function getQuotaForLimiter(limiter, accountId, maxRequests) {
  const limiterResult = await limiter.get(accountId);

  if (!limiterResult) {
    return {
      remaining: maxRequests,
      max: maxRequests,
      reset_in_seconds: 0,
    };
  }

  return {
    remaining: Math.max(0, limiterResult.remainingPoints),
    max: maxRequests,
    reset_in_seconds: Math.ceil(limiterResult.msBeforeNext / 1000),
  };
}

async function getQuotaForAccount(limiters, accountId) {
  const [text, image] = await Promise.all([
    getQuotaForLimiter(limiters.textLimiter, accountId, getMaxTextRequests()),
    getQuotaForLimiter(limiters.imageLimiter, accountId, getMaxImageRequests()),
  ]);

  return { text, image };
}

module.exports = {
  getMaxTextRequests,
  getMaxImageRequests,
  TEXT_KEY_PREFIX,
  IMAGE_KEY_PREFIX,
  RATE_LIMIT_DURATION_SECONDS,
  hasImageInput,
  createOpenAILimiters,
  getQuotaForAccount,
};
