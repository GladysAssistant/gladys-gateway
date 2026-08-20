const request = require('supertest');
const { expect, assert } = require('chai');
const nock = require('nock');
const configTest = require('../../tasks/config');
const { mockAccessTokenRefresh } = require('./utils.test');
const { initEnedisListener } = require('../../../core/enedis/enedisListener');

const queryParams = {
  usage_point_id: '12345678910123',
};

const data = {
  customer: {
    customer_id: '1358019319',
    usage_points: [
      {
        usage_point: {
          usage_point_id: '12345678910123',
          usage_point_status: 'com',
          meter_type: 'AMM',
        },
        contracts: {
          segment: 'C5',
          subscribed_power: '9 kVA',
          last_activation_date: '2013-08-14+01:00',
          distribution_tariff: 'BTINFCUST',
          offpeak_hours: 'HC (23h00-7h30)',
          contract_type: 'CRAE',
          contract_status: 'SERVC',
          last_distribution_tariff_change_date: '2017-05-25+01:00',
        },
      },
    ],
  },
};

const enedisRoute = '/customers_upc/v5/usage_points/contracts';

describe('EnedisWorker.getContract', function Describe() {
  this.timeout(5000);
  let enedisModel;
  let shutdown;
  before(async () => {
    ({ enedisModel, shutdown } = await initEnedisListener());
  });
  after(async () => {
    await shutdown();
  });
  it('should return enedis data', async () => {
    // First, finalize Enedis Oauth process
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/oauth2/v3/token', (body) => {
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
        usage_points_id: ['16401220101758', '16401220101710', '16401220101720'],
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    // Then, send first request
    mockAccessTokenRefresh();

    // First call: it'll refresh the access token from the API
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get(enedisRoute).query(queryParams).reply(200, data);

    // Refresh the usage point id
    await enedisModel.getAccessToken('b2d23f66-487d-493f-8acb-9c8adb400def');

    const response = await enedisModel.getContract('b2d23f66-487d-493f-8acb-9c8adb400def', queryParams.usage_point_id);
    expect(response).to.deep.equal({
      lastActivationDate: '2013-08-14+01:00',
    });
    // second call: it'll get the access token from Redis
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get(enedisRoute).query(queryParams).reply(200, data);
    const response2 = await enedisModel.getContract('b2d23f66-487d-493f-8acb-9c8adb400def', queryParams.usage_point_id);
    expect(response2).to.deep.equal({
      lastActivationDate: '2013-08-14+01:00',
    });
  });
  it('should return 403', async () => {
    // First, finalize Enedis Oauth process
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/oauth2/v3/token', (body) => {
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
        apigo_client_id: '73cd2d7f-e361-b7f6-48359493ed2c',
      });
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        code: 'someAuthCode',
        usage_points_id: ['16401220101758', '16401220101710', '16401220101720'],
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    // Then, send first request
    mockAccessTokenRefresh();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get(enedisRoute).query(queryParams).reply(403);

    // Refresh the usage point id
    await enedisModel.getAccessToken('b2d23f66-487d-493f-8acb-9c8adb400def');

    const response = enedisModel.getContract('b2d23f66-487d-493f-8acb-9c8adb400def', queryParams.usage_point_id);
    await assert.isRejected(response, 'Request failed with status code 403');
  });
  it('should return 400', async () => {
    // First, finalize Enedis Oauth process
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/oauth2/v3/token', (body) => {
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
        apigo_client_id: '73cd2d7f-e361-b7f6-48359493ed2c',
      });
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        code: 'someAuthCode',
        usage_points_id: ['16401220101758', '16401220101710', '16401220101720'],
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    // Then, send first request
    mockAccessTokenRefresh();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get(enedisRoute).query(queryParams).reply(400);

    // Refresh the usage point id
    await enedisModel.getAccessToken('b2d23f66-487d-493f-8acb-9c8adb400def');

    const response = enedisModel.getContract('b2d23f66-487d-493f-8acb-9c8adb400def', queryParams.usage_point_id);
    await assert.isRejected(response, 'Request failed with status code 400');
  });
});
