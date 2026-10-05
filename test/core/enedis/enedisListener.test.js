const { expect } = require('chai');
const { RateLimitError } = require('bullmq');
const { createEnedisJobProcessor, getRateLimitPauseInMs } = require('../../../core/enedis/enedisListener');

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
    error.response = { status: 429, headers: { 'retry-after': 'soon' } };
    const enedisModel = buildEnedisModel(async () => {
      throw error;
    });
    const thrown = await getError(createEnedisJobProcessor(logger, enedisModel)(job));
    expect(thrown).to.be.instanceOf(RateLimitError);
    expect(enedisModel.rateLimitCalls).to.deep.equal([10 * 60 * 1000]);
  });
});

describe('EnedisWorker rate limit pause', () => {
  const now = Date.parse('2026-10-05T15:00:00Z');
  it('should read a Retry-After in seconds', () => {
    expect(getRateLimitPauseInMs('120', now)).to.equal(120 * 1000);
  });
  it('should read a Retry-After HTTP-date', () => {
    expect(getRateLimitPauseInMs('Mon, 05 Oct 2026 15:30:00 GMT', now)).to.equal(30 * 60 * 1000);
  });
  it('should bound the pause to one hour', () => {
    expect(getRateLimitPauseInMs('Tue, 06 Oct 2026 15:00:00 GMT', now)).to.equal(60 * 60 * 1000);
    expect(getRateLimitPauseInMs('86400', now)).to.equal(60 * 60 * 1000);
  });
  it('should use the default pause without a usable Retry-After', () => {
    expect(getRateLimitPauseInMs(undefined, now)).to.equal(10 * 60 * 1000);
    expect(getRateLimitPauseInMs('', now)).to.equal(10 * 60 * 1000);
    expect(getRateLimitPauseInMs('soon', now)).to.equal(10 * 60 * 1000);
    expect(getRateLimitPauseInMs('0', now)).to.equal(10 * 60 * 1000);
    // A date in the past
    expect(getRateLimitPauseInMs('Mon, 05 Oct 2026 14:00:00 GMT', now)).to.equal(10 * 60 * 1000);
  });
});
