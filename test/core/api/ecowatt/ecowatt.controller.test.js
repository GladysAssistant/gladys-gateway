const request = require('supertest');
const { expect } = require('chai');
const nock = require('nock');

const ECOWATT_CACHE_KEY = 'ecowatt:data:v4';
const ECOWATT_STALE_CACHE_KEY = 'ecowatt:data:v4:stale';
const ECOWATT_REFRESH_LOCK_KEY = 'ecowatt:refresh-lock:v4';

const RTE_HOST = 'https://digital.iservices.rte-france.com';

const nockRteToken = () =>
  nock(RTE_HOST)
    .post('/token/oauth/', () => true)
    .reply(200, {
      access_token: 'access_token',
      expires_in: 100,
    });

// Interceptor that must stay unused: asserts it was never called then removes it
// so it doesn't leak into the next tests
const expectRteNotCalled = () => {
  const interceptor = nock(RTE_HOST).post('/token/oauth/', () => true);
  const scope = interceptor.reply(200, { access_token: 'access_token', expires_in: 100 });
  return () => {
    expect(scope.isDone()).to.equal(false);
    nock.removeInterceptor(interceptor);
  };
};

const nockRteSignals = (status, body) => nock(RTE_HOST).get('/open_api/ecowatt/v5/signals').reply(status, body);

const getEcowattSignals = (status = 200) =>
  request(TEST_BACKEND_APP)
    .get('/ecowatt/v4/signals')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(status);

describe('GET /ecowatt/v4/signals', () => {
  it('should return ecowatt data without retry', async () => {
    const rteToken = nockRteToken();
    const rteSignals = nockRteSignals(200, { data: true });
    const response = await getEcowattSignals();
    expect(response.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(response.body).to.deep.equal({
      data: true,
    });
    // From cache
    const responseFromCache = await getEcowattSignals();
    expect(responseFromCache.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(responseFromCache.body).to.deep.equal({
      data: true,
    });
    expect(rteToken.isDone()).to.equal(true);
    expect(rteSignals.isDone()).to.equal(true);
  });
  it('should keep a fresh copy with a TTL, a stale copy without TTL, and release the lock', async () => {
    nockRteToken();
    nockRteSignals(200, { data: true });
    await getEcowattSignals();
    expect(await TEST_LEGACY_REDIS_CLIENT.v4.ttl(ECOWATT_CACHE_KEY)).to.be.above(0);
    expect(await TEST_LEGACY_REDIS_CLIENT.v4.ttl(ECOWATT_STALE_CACHE_KEY)).to.equal(-1);
    expect(JSON.parse(await TEST_LEGACY_REDIS_CLIENT.v4.get(ECOWATT_STALE_CACHE_KEY))).to.deep.equal({ data: true });
    expect(await TEST_LEGACY_REDIS_CLIENT.v4.get(ECOWATT_REFRESH_LOCK_KEY)).to.equal(null);
  });
  it('should return ecowatt data with 2 retry', async () => {
    const rteScopes = [
      nockRteToken(),
      nockRteToken(),
      nockRteToken(),
      nockRteSignals(429, { error: 'too many requests' }),
      nockRteSignals(429, { error: 'too many requests' }),
      nockRteSignals(200, { data: true }),
    ];
    const response = await getEcowattSignals();
    expect(response.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(response.body).to.deep.equal({
      data: true,
    });
    // From cache
    const responseFromCache = await getEcowattSignals();
    expect(responseFromCache.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(responseFromCache.body).to.deep.equal({
      data: true,
    });
    rteScopes.forEach((scope) => expect(scope.isDone()).to.equal(true));
  });
  it('should return stale data when RTE keeps answering 429 after the cache expired', async () => {
    await TEST_LEGACY_REDIS_CLIENT.v4.set(ECOWATT_STALE_CACHE_KEY, JSON.stringify({ data: 'stale' }));
    // 1 call + 3 retries
    const rteScopes = [];
    for (let i = 0; i < 4; i += 1) {
      rteScopes.push(nockRteToken(), nockRteSignals(429, { error: 'too many requests' }));
    }
    const response = await getEcowattSignals();
    expect(response.body).to.deep.equal({ data: 'stale' });
    rteScopes.forEach((scope) => expect(scope.isDone()).to.equal(true));
    // The lock is kept as a cooldown: the next request doesn't call RTE again
    expect(await TEST_LEGACY_REDIS_CLIENT.v4.ttl(ECOWATT_REFRESH_LOCK_KEY)).to.be.above(0);
    const responseDuringCooldown = await getEcowattSignals();
    expect(responseDuringCooldown.body).to.deep.equal({ data: 'stale' });
  });
  it('should return stale data when RTE token endpoint answers 500', async () => {
    await TEST_LEGACY_REDIS_CLIENT.v4.set(ECOWATT_STALE_CACHE_KEY, JSON.stringify({ data: 'stale' }));
    const rteToken = nock(RTE_HOST)
      .post('/token/oauth/', () => true)
      .times(4)
      .reply(500, { error: 'internal error' });
    const response = await getEcowattSignals();
    expect(response.body).to.deep.equal({ data: 'stale' });
    expect(rteToken.isDone()).to.equal(true);
  });
  it('should fail when RTE fails and there is no stale data', async () => {
    const rteScopes = [];
    for (let i = 0; i < 4; i += 1) {
      rteScopes.push(nockRteToken(), nockRteSignals(429, { error: 'too many requests' }));
    }
    await getEcowattSignals(500);
    rteScopes.forEach((scope) => expect(scope.isDone()).to.equal(true));
  });
  it('should return stale data without calling RTE when another instance is refreshing', async () => {
    await TEST_LEGACY_REDIS_CLIENT.v4.set(ECOWATT_STALE_CACHE_KEY, JSON.stringify({ data: 'stale' }));
    await TEST_LEGACY_REDIS_CLIENT.v4.set(ECOWATT_REFRESH_LOCK_KEY, '1', { EX: 60 });
    const assertRteNotCalled = expectRteNotCalled();
    const response = await getEcowattSignals();
    expect(response.body).to.deep.equal({ data: 'stale' });
    assertRteNotCalled();
  });
  it('should wait for the other instance to refresh the data when there is no stale data', async () => {
    await TEST_LEGACY_REDIS_CLIENT.v4.set(ECOWATT_REFRESH_LOCK_KEY, '1', { EX: 60 });
    const assertRteNotCalled = expectRteNotCalled();
    // Simulate the instance holding the lock filling the cache a bit later
    setTimeout(() => {
      TEST_LEGACY_REDIS_CLIENT.v4.set(ECOWATT_CACHE_KEY, JSON.stringify({ data: 'refreshed' }), { EX: 60 });
    }, 50);
    const response = await getEcowattSignals();
    expect(response.body).to.deep.equal({ data: 'refreshed' });
    assertRteNotCalled();
  });
  it('should fail when the other instance never refreshes the data and there is no stale data', async () => {
    await TEST_LEGACY_REDIS_CLIENT.v4.set(ECOWATT_REFRESH_LOCK_KEY, '1', { EX: 60 });
    const assertRteNotCalled = expectRteNotCalled();
    await getEcowattSignals(500);
    assertRteNotCalled();
  });
  it('should only call RTE once for concurrent requests when the cache expired', async () => {
    const rteToken = nockRteToken();
    const rteSignals = nockRteSignals(200, { data: true });
    const responses = await Promise.all([getEcowattSignals(), getEcowattSignals(), getEcowattSignals()]);
    responses.forEach((response) => {
      expect(response.body).to.deep.equal({ data: true });
    });
    expect(rteToken.isDone()).to.equal(true);
    expect(rteSignals.isDone()).to.equal(true);
  });
});
