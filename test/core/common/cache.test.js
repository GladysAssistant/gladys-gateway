const { expect } = require('chai');
const {
  INVALIDATED_MARKER,
  getCachedValue,
  setCachedValue,
  invalidateCachedValues,
} = require('../../../core/common/cache');

const KEY = 'cache-test:key';

describe('cache invalidated on writes', () => {
  it('should return null when nothing is cached, the value otherwise', async () => {
    expect(await getCachedValue(TEST_REDIS_CLIENT, KEY)).to.equal(null);
    await setCachedValue(TEST_REDIS_CLIENT, KEY, [], 60);
    expect(await getCachedValue(TEST_REDIS_CLIENT, KEY)).to.deep.equal([]);
    expect(await TEST_REDIS_CLIENT.ttl(KEY)).to.be.within(55, 60);
  });

  it('should replace a cached value by a short-lived marker on invalidation', async () => {
    await setCachedValue(TEST_REDIS_CLIENT, KEY, { name: 'v4.0.0' }, 300);
    await invalidateCachedValues(TEST_REDIS_CLIENT, [KEY, 'cache-test:other']);
    expect(await TEST_REDIS_CLIENT.get(KEY)).to.equal(INVALIDATED_MARKER);
    expect(await TEST_REDIS_CLIENT.get('cache-test:other')).to.equal(INVALIDATED_MARKER);
    expect(await TEST_REDIS_CLIENT.ttl(KEY)).to.be.within(25, 30);
    expect(await getCachedValue(TEST_REDIS_CLIENT, KEY)).to.equal(null);
  });

  it('should not cache a value read in database before the invalidation', async () => {
    // a request reads the database (no Google Home linked yet)...
    const staleValue = [];
    // ...Google Home is linked meanwhile, and the cache invalidated...
    await invalidateCachedValues(TEST_REDIS_CLIENT, [KEY]);
    // ...then the request caches what it read
    await setCachedValue(TEST_REDIS_CLIENT, KEY, staleValue, 15 * 60);
    expect(await TEST_REDIS_CLIENT.get(KEY)).to.equal(INVALIDATED_MARKER);
    // once the marker expired, the value read then is cached
    await TEST_REDIS_CLIENT.del(KEY);
    await setCachedValue(TEST_REDIS_CLIENT, KEY, [{ id: 'user' }], 15 * 60);
    expect(await getCachedValue(TEST_REDIS_CLIENT, KEY)).to.deep.equal([{ id: 'user' }]);
  });
});
