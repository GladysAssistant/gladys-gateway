const request = require('supertest');
const { expect } = require('chai');
const nock = require('nock');

describe('GET /edf/tempo/today', () => {
  it('should return tempo data', async () => {
    nock('https://digital.iservices.rte-france.com')
      .post('/token/oauth/', () => true)
      .reply(200, {
        access_token: 'access_token',
        expires_in: 100,
      });
    nock('https://digital.iservices.rte-france.com')
      .get('/open_api/tempo_like_supply_contract/v1/tempo_like_calendars')
      .query(() => true)
      .reply(200, {
        tempo_like_calendars: {
          start_date: '2024-09-02T00:00:00+02:00',
          end_date: '2024-09-03T00:00:00+02:00',
          values: [
            {
              start_date: '2024-09-02T00:00:00+02:00',
              end_date: '2024-09-03T00:00:00+02:00',
              value: 'BLUE',
              updated_date: '2024-09-01T10:20:00+02:00',
            },
          ],
        },
      });
    nock('https://digital.iservices.rte-france.com')
      .get('/open_api/tempo_like_supply_contract/v1/tempo_like_calendars')
      .query(() => true)
      .reply(400, {
        error: 'TMPLIKSUPCON_TMPLIKCAL_F04',
        error_description:
          'The value of "end_date" field is incorrect. It is not possible to recover data to this term.',
        error_uri: '',
        error_details: {
          transaction_id: 'Id-2fc9d566cff9ded9d39d0ee7',
        },
      });
    const response = await request(TEST_BACKEND_APP)
      .get('/edf/tempo/today')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(response.body).to.deep.equal({
      today: 'blue',
      tomorrow: 'unknown',
    });
    // From cache
    const responseFromCache = await request(TEST_BACKEND_APP)
      .get('/edf/tempo/today')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(responseFromCache.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(responseFromCache.body).to.deep.equal({
      today: 'blue',
      tomorrow: 'unknown',
    });
  });
  it('should return tempo data with 2 unknown', async () => {
    nock('https://digital.iservices.rte-france.com')
      .post('/token/oauth/', () => true)
      .reply(200, {
        access_token: 'access_token',
        expires_in: 100,
      });
    nock('https://digital.iservices.rte-france.com')
      .get('/open_api/tempo_like_supply_contract/v1/tempo_like_calendars')
      .query(() => true)
      .reply(400, {
        error: 'TMPLIKSUPCON_TMPLIKCAL_F04',
        error_description:
          'The value of "end_date" field is incorrect. It is not possible to recover data to this term.',
        error_uri: '',
        error_details: {
          transaction_id: 'Id-2fc9d566cff9ded9d39d0ee7',
        },
      });
    nock('https://digital.iservices.rte-france.com')
      .get('/open_api/tempo_like_supply_contract/v1/tempo_like_calendars')
      .query(() => true)
      .reply(400, {
        error: 'TMPLIKSUPCON_TMPLIKCAL_F04',
        error_description:
          'The value of "end_date" field is incorrect. It is not possible to recover data to this term.',
        error_uri: '',
        error_details: {
          transaction_id: 'Id-2fc9d566cff9ded9d39d0ee7',
        },
      });
    const response = await request(TEST_BACKEND_APP)
      .get('/edf/tempo/today')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(response.body).to.deep.equal({
      today: 'unknown',
      tomorrow: 'unknown',
    });
  });
  it('should return tempo data with 2 blue', async () => {
    nock('https://digital.iservices.rte-france.com')
      .post('/token/oauth/', () => true)
      .reply(200, {
        access_token: 'access_token',
        expires_in: 100,
      });
    nock('https://digital.iservices.rte-france.com')
      .get('/open_api/tempo_like_supply_contract/v1/tempo_like_calendars')
      .query(() => true)
      .reply(200, {
        tempo_like_calendars: {
          start_date: '2024-09-02T00:00:00+02:00',
          end_date: '2024-09-03T00:00:00+02:00',
          values: [
            {
              start_date: '2024-09-02T00:00:00+02:00',
              end_date: '2024-09-03T00:00:00+02:00',
              value: 'BLUE',
              updated_date: '2024-09-01T10:20:00+02:00',
            },
          ],
        },
      });
    nock('https://digital.iservices.rte-france.com')
      .get('/open_api/tempo_like_supply_contract/v1/tempo_like_calendars')
      .query(() => true)
      .reply(200, {
        tempo_like_calendars: {
          start_date: '2024-09-02T00:00:00+02:00',
          end_date: '2024-09-03T00:00:00+02:00',
          values: [
            {
              start_date: '2024-09-02T00:00:00+02:00',
              end_date: '2024-09-03T00:00:00+02:00',
              value: 'BLUE',
              updated_date: '2024-09-01T10:20:00+02:00',
            },
          ],
        },
      });
    const response = await request(TEST_BACKEND_APP)
      .get('/edf/tempo/today')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(response.body).to.deep.equal({
      today: 'blue',
      tomorrow: 'blue',
    });
    // From cache
    const responseFromCache = await request(TEST_BACKEND_APP)
      .get('/edf/tempo/today')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(responseFromCache.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(responseFromCache.body).to.deep.equal({
      today: 'blue',
      tomorrow: 'blue',
    });
  });
});
