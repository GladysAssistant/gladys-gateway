const request = require('supertest');
const { expect } = require('chai');
const nock = require('nock');
const configTest = require('../../../tasks/config');

const data = {
  meter_reading: {
    usage_point_id: '16401220101758',
    start: '2019-05-06',
    end: '2019-05-12',
    quality: 'BRUT',
    reading_type: {
      measurement_kind: 'power',
      unit: 'W',
      aggregate: 'average',
    },
    interval_reading: [
      {
        value: '540',
        date: '2019-05-06 03:00:00',
        interval_length: 'PT30M',
        measure_type: 'B',
      },
    ],
  },
};

describe('GET /enedis/api/v4/metering_data/consumption_load_curve', async function Describe() {
  this.timeout(5000);
  it('should return enedis consumption load curve data', async () => {
    // First, finalize Enedis Oauth process
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/v1/oauth2/token', (body) => {
        const grandTypeValid = body.grant_type === 'authorization_code';
        const codeValid = body.code === 'someAuthCode';
        const clientIdValid = body.client_id === process.env.ENEDIS_GRANT_CLIENT_ID;
        const clientSecretValid = body.client_secret === process.env.ENEDIS_GRANT_CLIENT_SECRET;
        return grandTypeValid && codeValid && clientIdValid && clientSecretValid;
      })
      .reply(200, {
        access_token: 'ba42fe5a-0eaa-11e5-9813-4dd05b3a25f3',
        token_type: 'Bearer',
        expires_in: 12600,
        refresh_token: '7dnCbf8P0ypCyxbnX7tUKjcSveE2Nu8w',
        scope: '/v3/metering_data/consumption_load_curve.GET',
        issued_at: '1487075532179',
        refresh_token_issued_at: '1487075532179',
        usage_points_id: '16401220101758,16401220101710,16401220101720',
        apigo_client_id: '73cd2d7f-e361-b7f6-48359493ed2c',
      });
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        code: 'someAuthCode',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    // Then, send first request
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/v1/oauth2/token', (body) => {
        const grandTypeValid = body.grant_type === 'refresh_token';
        const refreshTokenValid = body.refresh_token === '7dnCbf8P0ypCyxbnX7tUKjcSveE2Nu8w';
        const clientIdValid = body.client_id === process.env.ENEDIS_GRANT_CLIENT_ID;
        const clientSecretValid = body.client_secret === process.env.ENEDIS_GRANT_CLIENT_SECRET;
        return grandTypeValid && refreshTokenValid && clientIdValid && clientSecretValid;
      })
      .reply(200, {
        access_token: 'ba42fe5a-0eaa-11e5-9813-4dd05b3a25f3',
        token_type: 'Bearer',
        expires_in: 12600,
        refresh_token: '7dnCbf8P0ypCyxbnX7tUKjcSveE2Nu8w',
        scope: '/v3/metering_data/consumption_load_curve.GET',
        issued_at: '1487075532179',
        refresh_token_issued_at: '1487075532179',
        usage_points_id: '16401220101758,16401220101710,16401220101720',
        apigo_client_id: '73cd2d7f-e361-b7f6-48359493ed2c',
      });

    // First call: it'll refresh the access token from the API
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get('/v4/metering_data/consumption_load_curve').reply(200, data);
    const response = await request(TEST_BACKEND_APP)
      .get('/enedis/api/v4/metering_data/consumption_load_curve')
      .query({
        usage_point_id: 16401220101758,
        start: '2022-08-01',
        end: '2022-08-03',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal(data);
    // second call: it'll get the access token from Redis
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get('/v4/metering_data/consumption_load_curve').reply(200, data);
    const response2 = await request(TEST_BACKEND_APP)
      .get('/enedis/api/v4/metering_data/consumption_load_curve')
      .query({
        usage_point_id: 16401220101758,
        start: '2022-08-01',
        end: '2022-08-03',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response2.body).to.deep.equal(data);
  });
  it('should return 403', async () => {
    await request(TEST_BACKEND_APP)
      .get('/enedis/api/v4/metering_data/consumption_load_curve')
      .query({
        usage_point_id: 16401220101758,
        start: '2022-08-01',
        end: '2022-08-03',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(403);
  });
});
