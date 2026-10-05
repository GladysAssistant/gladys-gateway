const { expect } = require('chai');
const { RateLimitError } = require('bullmq');
const { createEnedisJobProcessor } = require('../../../core/enedis/enedisListener');

const logger = {
  warn: () => {},
};

const job = { name: 'daily-consumption', data: {} };

const buildEnedisModel = (enedisSyncData) => {
  const rateLimitCalls = [];
  return {
    rateLimitCalls,
    enedisSyncData,
    queue: {
      rateLimit: async (expireTimeMs) => {
        rateLimitCalls.push(expireTimeMs);
      },
    },
  };
};

const getError = async (promise) => {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  return null;
};

describe('EnedisWorker job processor', () => {
  it('should return the result of the job', async () => {
    const enedisModel = buildEnedisModel(async () => 'result');
    const result = await createEnedisJobProcessor(logger, enedisModel)(job);
    expect(result).to.equal('result');
    expect(enedisModel.rateLimitCalls).to.deep.equal([]);
  });
  it('should rethrow an error which is not a 429 without pausing the queue', async () => {
    const error = new Error('Request failed with status code 500');
    error.response = { status: 500, headers: {} };
    const enedisModel = buildEnedisModel(async () => {
      throw error;
    });
    const thrown = await getError(createEnedisJobProcessor(logger, enedisModel)(job));
    expect(thrown).to.equal(error);
    expect(enedisModel.rateLimitCalls).to.deep.equal([]);
  });
  it('should pause the queue for the Retry-After delay on a 429', async () => {
    const error = new Error('Request failed with status code 429');
    error.response = { status: 429, headers: { 'retry-after': '120' } };
    const enedisModel = buildEnedisModel(async () => {
      throw error;
    });
    const thrown = await getError(createEnedisJobProcessor(logger, enedisModel)(job));
    // A RateLimitError moves the job back to wait without consuming an attempt
    expect(thrown).to.be.instanceOf(RateLimitError);
    expect(enedisModel.rateLimitCalls).to.deep.equal([120 * 1000]);
  });
  it('should pause the queue for 10 minutes on a 429 without a usable Retry-After', async () => {
    const error = new Error('Request failed with status code 429');
    error.response = { status: 429, headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' } };
    const enedisModel = buildEnedisModel(async () => {
      throw error;
    });
    const thrown = await getError(createEnedisJobProcessor(logger, enedisModel)(job));
    expect(thrown).to.be.instanceOf(RateLimitError);
    expect(enedisModel.rateLimitCalls).to.deep.equal([10 * 60 * 1000]);
  });
});
