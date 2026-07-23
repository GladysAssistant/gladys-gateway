const { createOpenAILimiters, getQuotaForAccount } = require('../../service/openAIRateLimit');

module.exports = function OpenAIModel(logger, db, redisClient, instanceModel) {
  const limiters = createOpenAILimiters(redisClient);

  async function getQuota(instance) {
    const account = await instanceModel.getAccountByInstanceId(instance.id);
    return getQuotaForAccount(limiters, account.id);
  }

  async function saveUsage(usage) {
    try {
      await db.t_ai_usage.insert(usage);
    } catch (e) {
      // AI usage tracking should never make the AI request fail
      logger.error('OpenAI: Unable to save AI usage in database');
      logger.error(e);
    }
  }

  return {
    getQuota,
    saveUsage,
  };
};
