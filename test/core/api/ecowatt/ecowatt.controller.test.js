const request = require('supertest');
const { expect } = require('chai');
const nock = require('nock');

describe('GET /ecowatt/v4/signals', () => {
  it('should return ecowatt data without retry', async () => {
    nock('https://digital.iservices.rte-france.com')
      .post('/token/oauth/', () => true)
      .reply(200, {
        access_token: 'access_token',
        expires_in: 100,
      });
    nock('https://digital.iservices.rte-france.com').get('/open_api/ecowatt/v5/signals').reply(200, {
      data: true,
    });
    const response = await request(TEST_BACKEND_APP)
      .get('/ecowatt/v4/signals')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(response.body).to.deep.equal({
      data: true,
    });
    // From cache
    const responseFromCache = await request(TEST_BACKEND_APP)
      .get('/ecowatt/v4/signals')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(responseFromCache.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(responseFromCache.body).to.deep.equal({
      data: true,
    });
  });
  it('should return ecowatt data with 2 retry', async () => {
    nock('https://digital.iservices.rte-france.com')
      .post('/token/oauth/', () => true)
      .reply(200, {
        access_token: 'access_token',
        expires_in: 100,
      });
    nock('https://digital.iservices.rte-france.com')
      .post('/token/oauth/', () => true)
      .reply(200, {
        access_token: 'access_token',
        expires_in: 100,
      });
    nock('https://digital.iservices.rte-france.com')
      .post('/token/oauth/', () => true)
      .reply(200, {
        access_token: 'access_token',
        expires_in: 100,
      });
    nock('https://digital.iservices.rte-france.com').get('/open_api/ecowatt/v5/signals').reply(429, {
      error: 'too many requests',
    });
    nock('https://digital.iservices.rte-france.com').get('/open_api/ecowatt/v5/signals').reply(429, {
      error: 'too many requests',
    });
    nock('https://digital.iservices.rte-france.com').get('/open_api/ecowatt/v5/signals').reply(200, {
      data: true,
    });
    const response = await request(TEST_BACKEND_APP)
      .get('/ecowatt/v4/signals')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(response.body).to.deep.equal({
      data: true,
    });
    // From cache
    const responseFromCache = await request(TEST_BACKEND_APP)
      .get('/ecowatt/v4/signals')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(responseFromCache.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(responseFromCache.body).to.deep.equal({
      data: true,
    });
  });
});
