const request = require('supertest');
const { expect, assert } = require('chai');
const nock = require('nock');
const configTest = require('../../tasks/config');
const { initEnedisListener } = require('../../../core/enedis/enedisListener');

const queryParams = {
  usage_point_id: '16401220101758',
  start: '2022-08-01',
  end: '2022-08-03',
};

const data = {
  meter_reading: {
    usage_point_id: '16401220101758',
    start: queryParams.start,
    end: queryParams.end,
    quality: 'BRUT',
    reading_type: {
      measurement_kind: 'power',
      unit: 'W',
      aggregate: 'average',
    },
    interval_reading: [
      {
        value: '100',
        date: '2022-08-01',
        interval_length: 'PT30M',
        measure_type: 'B',
      },
      {
        value: '200',
        date: '2022-08-02',
        interval_length: 'PT30M',
        measure_type: 'B',
      },
      {
        value: '300',
        date: '2022-08-03',
        interval_length: 'PT30M',
        measure_type: 'B',
      },
    ],
  },
};

const enedisRoute = '/v4/metering_data/daily_consumption';

describe('EnedisWorker.getDataDailyConsumption', function Describe() {
  this.timeout(5000);
  let enedisModel;
  let db;
  let worker;
  before(async () => {
    ({ enedisModel, db, worker } = await initEnedisListener());
  });
  after(async () => {
    await worker.close();
  });
  it('should return enedis data', async () => {
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
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get(enedisRoute).query(queryParams).reply(200, data);
    const response = await enedisModel.getDataDailyConsumption(
      '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      queryParams.usage_point_id,
      queryParams.start,
      queryParams.end,
    );
    expect(response).to.deep.equal(data);
    // second call: it'll get the access token from Redis
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get(enedisRoute).query(queryParams).reply(200, data);
    const response2 = await enedisModel.getDataDailyConsumption(
      '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      queryParams.usage_point_id,
      queryParams.start,
      queryParams.end,
    );
    expect(response2).to.deep.equal(data);
    const dailyConsumptions = await db.t_enedis_daily_consumption.find(
      {
        usage_point_id: queryParams.usage_point_id,
      },
      {
        fields: ['usage_point_id', 'value'],
        order: [
          {
            field: 'created_at',
            direction: 'asc',
          },
        ],
      },
    );
    expect(dailyConsumptions).to.deep.equal([
      { usage_point_id: '16401220101758', value: 100 },
      { usage_point_id: '16401220101758', value: 200 },
      { usage_point_id: '16401220101758', value: 300 },
    ]);
  });
  it('should return 403', async () => {
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
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get(enedisRoute).query(queryParams).reply(403);
    const response = enedisModel.getDataDailyConsumption(
      '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      queryParams.usage_point_id,
      queryParams.start,
      queryParams.end,
    );
    await assert.isRejected(response, 'Request failed with status code 403');
  });
  it('should return 400', async () => {
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
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get(enedisRoute).query(queryParams).reply(400);
    const response = enedisModel.getDataDailyConsumption(
      '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      queryParams.usage_point_id,
      queryParams.start,
      queryParams.end,
    );
    await assert.isRejected(response, 'Request failed with status code 400');
  });
});
