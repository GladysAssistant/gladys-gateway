const { createOpenAILimiters, getQuotaForAccount } = require('../../service/openAIRateLimit');

module.exports = function OpenAIModel(redisClient, instanceModel) {
  const limiters = createOpenAILimiters(redisClient);

  async function getQuota(instance) {
    const account = await instanceModel.getAccountByInstanceId(instance.id);
    return getQuotaForAccount(limiters, account.id);
  }

  return {
    getQuota,
  };
};
