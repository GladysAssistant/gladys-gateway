const request = require('supertest');
const { expect } = require('chai');
const configTest = require('../../tasks/config');

const ACCOUNT_ID = 'b2d23f66-487d-493f-8acb-9c8adb400def';
const INSTANCE_ID = '0bc53f3c-1e11-40d3-99a4-bd392a666eaf';
const GRANTED_ACCESS_CACHE_KEY = `check_user_plan_granted:plus:instance:${INSTANCE_ID}`;

// GET /openai/quota is a Plus route called by an instance
const getQuota = (expectedStatus) =>
  request(TEST_BACKEND_APP)
    .get('/openai/quota')
    .set('Accept', 'application/json')
    .set('Authorization', configTest.jwtAccessTokenInstance)
    .expect('Content-Type', /json/)
    .expect(expectedStatus);

const updateAccount = (fields) => TEST_DATABASE_INSTANCE.t_account.update({ id: ACCOUNT_ID }, fields);

describe('checkUserPlan middleware', () => {
  it('should cache a granted access for 5 minutes', async () => {
    await updateAccount({ plan: 'plus', status: 'active' });
    await getQuota(200);

    const ttl = await TEST_REDIS_CLIENT.ttl(GRANTED_ACCESS_CACHE_KEY);
    expect(ttl).to.be.within(1, 5 * 60);

    // the access is not checked again in database until the cache expires
    await updateAccount({ status: 'canceled' });
    await getQuota(200);

    await TEST_REDIS_CLIENT.del(GRANTED_ACCESS_CACHE_KEY);
    await getQuota(402);
  });

  it('should never cache an account that is not active, so it gets in as soon as it pays', async () => {
    await updateAccount({ plan: 'plus', status: 'canceled' });
    await getQuota(402);
    expect(await TEST_REDIS_CLIENT.exists(GRANTED_ACCESS_CACHE_KEY)).to.equal(0);

    await updateAccount({ status: 'active' });
    await getQuota(200);
  });

  it('should never cache an account in another plan, so it gets in as soon as it upgrades', async () => {
    await updateAccount({ plan: 'lite', status: 'active' });
    await getQuota(403);
    expect(await TEST_REDIS_CLIENT.exists(GRANTED_ACCESS_CACHE_KEY)).to.equal(0);

    await updateAccount({ plan: 'plus' });
    await getQuota(200);
  });
  it('should check the access in database when Redis fails', async () => {
    const originalGet = TEST_REDIS_CLIENT.get;
    const originalSet = TEST_REDIS_CLIENT.set;
    TEST_REDIS_CLIENT.get = () => Promise.reject(new Error('Redis is down'));
    TEST_REDIS_CLIENT.set = () => Promise.reject(new Error('Redis is down'));
    try {
      await updateAccount({ plan: 'plus', status: 'active' });
      await getQuota(200);
      await updateAccount({ status: 'canceled' });
      await getQuota(402);
    } finally {
      TEST_REDIS_CLIENT.get = originalGet;
      TEST_REDIS_CLIENT.set = originalSet;
    }
  });
  it('should not wait for Redis while it reconnects', async () => {
    const originalGet = TEST_REDIS_CLIENT.get;
    // node-redis queues the commands while it reconnects: the read never answers in time
    TEST_REDIS_CLIENT.get = () => new Promise(() => {});
    try {
      await updateAccount({ plan: 'plus', status: 'active' });
      const startedAt = Date.now();
      await getQuota(200);
      expect(Date.now() - startedAt).to.be.below(1000);
    } finally {
      TEST_REDIS_CLIENT.get = originalGet;
    }
  });
});
