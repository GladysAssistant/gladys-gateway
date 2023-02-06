const request = require('supertest');
const { expect, assert } = require('chai');
const nock = require('nock');
const configTest = require('../../tasks/config');
const { mockAccessTokenRefresh } = require('./utils.test');
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
        date: '2022-08-01 00:00:00',
        interval_length: 'PT30M',
        measure_type: 'B',
      },
      {
        value: '200',
        date: '2022-08-02 00:30:00',
        interval_length: 'PT30M',
        measure_type: 'B',
      },
      {
        value: '300',
        date: '2022-08-03 01:00:00',
        interval_length: 'PT30M',
        measure_type: 'B',
      },
    ],
  },
};

const enedisRoute = '/metering_data_clc/v5/consumption_load_curve';

describe('EnedisWorker.getConsumptionLoadCurve', function Describe() {
  this.timeout(5000);
  let enedisModel;
  let db;
  let shutdown;
  before(async () => {
    ({ enedisModel, db, shutdown } = await initEnedisListener());
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

    const createdSync = await db.t_enedis_sync.insert({
      usage_point_id: queryParams.usage_point_id,
      jobs_total: 2,
    });

    const response = await enedisModel.getConsumptionLoadCurve(
      'b2d23f66-487d-493f-8acb-9c8adb400def',
      queryParams.usage_point_id,
      queryParams.start,
      queryParams.end,
      createdSync.id,
    );
    expect(response).to.deep.equal(data);
    // second call: it'll get the access token from Redis
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get(enedisRoute).query(queryParams).reply(200, data);
    const response2 = await enedisModel.getConsumptionLoadCurve(
      'b2d23f66-487d-493f-8acb-9c8adb400def',
      queryParams.usage_point_id,
      queryParams.start,
      queryParams.end,
      createdSync.id,
    );
    expect(response2).to.deep.equal(data);
    const consumptionLoadCurve = await db.t_enedis_consumption_load_curve.find(
      {
        usage_point_id: queryParams.usage_point_id,
      },
      {
        fields: ['usage_point_id', 'value', 'created_at'],
        order: [
          {
            field: 'created_at',
            direction: 'asc',
          },
        ],
      },
    );
    expect(consumptionLoadCurve).to.deep.equal([
      { usage_point_id: '16401220101758', value: 100, created_at: new Date('2022-07-31T22:00:00.000Z') },
      { usage_point_id: '16401220101758', value: 200, created_at: new Date('2022-08-01T22:30:00.000Z') },
      { usage_point_id: '16401220101758', value: 300, created_at: new Date('2022-08-02T23:00:00.000Z') },
    ]);
    const syncUpdated = await db.t_enedis_sync.findOne({
      usage_point_id: '16401220101758',
    });
    expect(syncUpdated).to.have.property('jobs_done', 2);
  });
  it('should play jobs and return enedis data', async () => {
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

    // First call: it'll refresh the access token from the API
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`).get(enedisRoute).query(queryParams).reply(200, data);

    // Refresh the usage point id
    await enedisModel.getAccessToken('b2d23f66-487d-493f-8acb-9c8adb400def');

    const createdSync = await db.t_enedis_sync.insert({
      usage_point_id: queryParams.usage_point_id,
      jobs_total: 2,
    });

    await enedisModel.enedisSyncData({
      name: 'consumption-load-curve',
      data: {
        account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
        sync_id: createdSync.id,
        ...queryParams,
      },
    });
    const consumptionLoadCurve = await db.t_enedis_consumption_load_curve.find(
      {
        usage_point_id: queryParams.usage_point_id,
      },
      {
        fields: ['usage_point_id', 'value', 'created_at'],
        order: [
          {
            field: 'created_at',
            direction: 'asc',
          },
        ],
      },
    );
    expect(consumptionLoadCurve).to.deep.equal([
      { usage_point_id: '16401220101758', value: 100, created_at: new Date('2022-07-31T22:00:00.000Z') },
      { usage_point_id: '16401220101758', value: 200, created_at: new Date('2022-08-01T22:30:00.000Z') },
      { usage_point_id: '16401220101758', value: 300, created_at: new Date('2022-08-02T23:00:00.000Z') },
    ]);
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

    const createdSync = await db.t_enedis_sync.insert({
      usage_point_id: queryParams.usage_point_id,
      jobs_total: 2,
    });

    const response = enedisModel.getConsumptionLoadCurve(
      'b2d23f66-487d-493f-8acb-9c8adb400def',
      queryParams.usage_point_id,
      queryParams.start,
      queryParams.end,
      createdSync.id,
    );
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

    const createdSync = await db.t_enedis_sync.insert({
      usage_point_id: queryParams.usage_point_id,
      jobs_total: 2,
    });

    const response = enedisModel.getConsumptionLoadCurve(
      'b2d23f66-487d-493f-8acb-9c8adb400def',
      queryParams.usage_point_id,
      queryParams.start,
      queryParams.end,
      createdSync.id,
    );
    await assert.isRejected(response, 'Request failed with status code 400');
  });
  it('should revoke enedis device', async () => {
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
    mockAccessTokenRefresh(400);
    const response = enedisModel.getConsumptionLoadCurve(
      'b2d23f66-487d-493f-8acb-9c8adb400def',
      queryParams.usage_point_id,
      queryParams.start,
      queryParams.end,
      'useless-id-because-we-will-not-reach-this-stage',
    );
    await assert.isRejected(response, 'Request failed with status code 400');
    const device = await db.t_device.findOne({
      client_id: process.env.ENEDIS_GRANT_CLIENT_ID,
    });
    expect(device).to.have.property('revoked', true);
  });
});
