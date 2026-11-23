const request = require('supertest');
const nock = require('nock');
const { expect } = require('chai');

describe('GET /edf/tempo/historical', () => {
  it('should return tempo data', async () => {
    await TEST_DATABASE_INSTANCE.t_tempo_historical_data.insert({
      created_at: '2024-09-02',
      day_type: 'blue',
    });
    await TEST_DATABASE_INSTANCE.t_tempo_historical_data.insert({
      created_at: '2024-09-03',
      day_type: 'white',
    });
    const response = await request(TEST_BACKEND_APP)
      .get('/edf/tempo/historical')
      .query({
        start_date: '2024-09-02',
        take: 20,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(response.body).to.deep.equal([
      {
        created_at: '2024-09-02',
        day_type: 'blue',
      },
      {
        created_at: '2024-09-03',
        day_type: 'white',
      },
    ]);
  });
});

describe('GET /edf/tempo/historical (cache)', () => {
  beforeEach(async () => {
    await TEST_DATABASE_INSTANCE.t_tempo_historical_data.insert([
      { created_at: '2024-09-02', day_type: 'blue' },
      { created_at: '2024-09-03', day_type: 'white' },
      { created_at: '2024-09-04', day_type: 'red' },
    ]);
  });

  const getHistoricalData = (query, status = 200) =>
    request(TEST_BACKEND_APP).get('/edf/tempo/historical').query(query).expect(status);

  it('should serve the days since the start date from the cached history', async () => {
    const response = await getHistoricalData({ start_date: '2024-09-03', take: 1000000 });
    expect(response.body).to.deep.equal([
      { created_at: '2024-09-03', day_type: 'white' },
      { created_at: '2024-09-04', day_type: 'red' },
    ]);
    expect(await TEST_REDIS_CLIENT.ttl('tempo:historical')).to.be.within(3590, 3600);
    // the whole history is cached, whatever the start date asked
    await TEST_DATABASE_INSTANCE.t_tempo_historical_data.insert({ created_at: '2024-09-05', day_type: 'blue' });
    const fromCache = await getHistoricalData({ start_date: '2024-09-01', take: 2 });
    expect(fromCache.body).to.deep.equal([
      { created_at: '2024-09-02', day_type: 'blue' },
      { created_at: '2024-09-03', day_type: 'white' },
    ]);
    // without take, every day since the start date
    const withoutTake = await getHistoricalData({ start_date: '2024-09-04' });
    expect(withoutTake.body).to.deep.equal([{ created_at: '2024-09-04', day_type: 'red' }]);
  });

  it('should invalidate the cached history when the color of the day is saved', async () => {
    await getHistoricalData({ start_date: '2024-09-02', take: 10 });
    expect(await TEST_REDIS_CLIENT.get('tempo:historical')).to.not.equal(null);
    nock('https://digital.iservices.rte-france.com')
      .post('/token/oauth/', () => true)
      .reply(200, { access_token: 'access_token', expires_in: 100 });
    nock('https://digital.iservices.rte-france.com')
      .get('/open_api/tempo_like_supply_contract/v1/tempo_like_calendars')
      .query(() => true)
      .times(2)
      .reply(200, { tempo_like_calendars: { values: [{ value: 'WHITE' }] } });
    await request(TEST_BACKEND_APP).get('/edf/tempo/today').expect(200);
    expect(await TEST_REDIS_CLIENT.get('tempo:historical')).to.equal('invalidated');
    // the history read meanwhile has the new day, and is not cached until the marker expires
    const response = await getHistoricalData({ start_date: '2024-09-04' });
    expect(response.body[0]).to.deep.equal({ created_at: '2024-09-04', day_type: 'red' });
    expect(response.body).to.have.lengthOf(2);
    expect(await TEST_REDIS_CLIENT.get('tempo:historical')).to.equal('invalidated');
  });

  it('should read any other start date in database', async () => {
    const response = await getHistoricalData({ start_date: '2024-09-04T00:00:00', take: 5 });
    expect(response.body).to.deep.equal([{ created_at: '2024-09-04', day_type: 'red' }]);
    expect(await TEST_REDIS_CLIENT.get('tempo:historical')).to.equal(null);
  });

  it('should return 400 when take is not a positive integer', async () => {
    await getHistoricalData({ start_date: '2024-09-02', take: 'all' }, 400);
    await getHistoricalData({ start_date: '2024-09-02', take: -1 }, 400);
  });

  it('should read the history in database when Redis fails', async () => {
    const TempoModel = require('../../../../core/api/tempo/tempo.model'); // eslint-disable-line global-require
    const warnings = [];
    const logger = { warn: (message) => warnings.push(message) };
    const brokenRedis = {
      isReady: true,
      get: async () => {
        throw new Error('redis down');
      },
      set: async () => {
        throw new Error('redis down');
      },
    };
    const tempoModel = TempoModel(logger, TEST_DATABASE_INSTANCE, brokenRedis);
    const days = await tempoModel.getHistoricalData({ start_date: '2024-09-04', take: '10' });
    expect(days).to.deep.equal([{ created_at: '2024-09-04', day_type: 'red' }]);
    expect(warnings[0]).to.equal('Tempo: unable to read the historical data cache (redis down)');
  });
});
