const { expect } = require('chai');
const { invalidateGoogleUsersCacheOfUser } = require('../../../../core/common/google-users-cache');

const INSTANCE_ID = '0bc53f3c-1e11-40d3-99a4-bd392a666eaf';
const USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
const ACCOUNT_ID = 'b2d23f66-487d-493f-8acb-9c8adb400def';
const CACHE_KEY = `google-users:${INSTANCE_ID}`;

describe('Google Home users cache', () => {
  async function linkGoogleHome() {
    const code = await TEST_MODELS.googleModel.getCode(USER_ID);
    await TEST_MODELS.googleModel.getRefreshTokenAndAccessToken(code);
    const [device] = await TEST_DATABASE_INSTANCE.t_device.find({
      user_id: USER_ID,
      client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
    });
    return device;
  }

  // With a user who linked Google Home, the report is sent to Google (not mocked here, the
  // error is ignored): only the users the instance found matter
  async function reportState() {
    await TEST_MODELS.googleModel.reportState(INSTANCE_ID, { devices: { states: {} } }).catch(() => {});
  }

  it('should cache the users of the instance for 15 minutes', async () => {
    await reportState();
    expect(await TEST_REDIS_CLIENT.get(CACHE_KEY)).to.equal('[]');
    expect(await TEST_REDIS_CLIENT.ttl(CACHE_KEY)).to.be.within(15 * 60 - 10, 15 * 60);
  });

  it('should invalidate the cache of the instances of the account when Google Home is linked', async () => {
    await reportState();
    await linkGoogleHome();
    expect(await TEST_REDIS_CLIENT.get(CACHE_KEY)).to.equal('invalidated');
    // while the marker lives, the report states read the database and cache nothing
    await reportState();
    expect(await TEST_REDIS_CLIENT.get(CACHE_KEY)).to.equal('invalidated');
    // once it expired, the new user is cached
    await TEST_REDIS_CLIENT.del(CACHE_KEY);
    await reportState();
    expect(JSON.parse(await TEST_REDIS_CLIENT.get(CACHE_KEY))).to.deep.equal([{ id: USER_ID, account_id: ACCOUNT_ID }]);
  });

  it('should invalidate the cache when the Google Home session is revoked', async () => {
    const device = await linkGoogleHome();
    await TEST_REDIS_CLIENT.set(CACHE_KEY, JSON.stringify([{ id: USER_ID, account_id: ACCOUNT_ID }]));
    await TEST_MODELS.deviceModel.revokeDevice({ id: USER_ID }, device.id);
    expect(await TEST_REDIS_CLIENT.get(CACHE_KEY)).to.equal('invalidated');
    await TEST_REDIS_CLIENT.del(CACHE_KEY);
    await reportState();
    expect(await TEST_REDIS_CLIENT.get(CACHE_KEY)).to.equal('[]');
  });

  it('should keep the cache when another session of the user is revoked', async () => {
    await TEST_REDIS_CLIENT.set(CACHE_KEY, '[]');
    // a session of the dashboard (fixture), not Google Home
    await TEST_MODELS.deviceModel.revokeDevice({ id: USER_ID }, '1356c620-0c88-46fc-87bf-de620f30f0e3');
    expect(await TEST_REDIS_CLIENT.get(CACHE_KEY)).to.equal('[]');
  });

  it('should never throw when the cache cannot be invalidated', async () => {
    const warnings = [];
    const logger = { warn: (message) => warnings.push(message) };
    // Redis reconnecting: the invalidation does not wait for it
    const reconnectingRedis = { isReady: false };
    await invalidateGoogleUsersCacheOfUser(logger, TEST_DATABASE_INSTANCE, reconnectingRedis, USER_ID);
    expect(warnings[0]).to.equal(`Unable to invalidate the Google Home users cache (${USER_ID}): Redis is not ready`);
  });

  it('should not wait more than a moment for a Redis that does not answer', async () => {
    const warnings = [];
    const logger = { warn: (message) => warnings.push(message) };
    const silentRedis = {
      isReady: true,
      multi: () => ({ set() {}, exec: () => new Promise(() => {}) }),
    };
    const start = Date.now();
    await invalidateGoogleUsersCacheOfUser(logger, TEST_DATABASE_INSTANCE, silentRedis, USER_ID);
    expect(Date.now() - start).to.be.below(1000);
    expect(warnings[0]).to.match(/Redis did not answer within 200 ms$/);
  });
});
