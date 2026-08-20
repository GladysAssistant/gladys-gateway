const request = require('supertest');
const { expect } = require('chai');
const nock = require('nock');
const configTest = require('../../tasks/config');
const { mockAccessTokenRefresh } = require('./utils.test');
const { initEnedisListener } = require('../../../core/enedis/enedisListener');

const ACCOUNT_ID = 'b2d23f66-487d-493f-8acb-9c8adb400def';

const queryParams = {
  usage_point_id: '16401220101758',
  start: '2022-08-01',
  end: '2022-08-03',
};

const meteringData = {
  meter_reading: {
    usage_point_id: queryParams.usage_point_id,
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
    ],
  },
};

const finalizeOauthProcess = async () => {
  nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
    .post('/oauth2/v3/token', (body) => body.grant_type === 'authorization_code')
    .reply(200, {
      access_token: 'ba42fe5a-0eaa-11e5-9813-4dd05b3a25f3',
      token_type: 'Bearer',
      expires_in: 12600,
      refresh_token: '7dnCbf8P0ypCyxbnX7tUKjcSveE2Nu8w',
      issued_at: '1487075532179',
      refresh_token_issued_at: '1487075532179',
    });
  await request(TEST_BACKEND_APP)
    .post('/enedis/finalize')
    .send({
      code: 'someAuthCode',
      usage_points_id: [queryParams.usage_point_id],
    })
    .set('Accept', 'application/json')
    .set('Authorization', configTest.jwtAccessTokenDashboard)
    .expect(200);
  mockAccessTokenRefresh();
};

describe('EnedisWorker with ENEDIS_USE_2026_APIS enabled', function Describe() {
  this.timeout(5000);
  let enedisModel;
  let db;
  let shutdown;
  let previousValue;
  before(async () => {
    previousValue = process.env.ENEDIS_USE_2026_APIS;
    process.env.ENEDIS_USE_2026_APIS = 'true';
    ({ enedisModel, db, shutdown } = await initEnedisListener());
  });
  after(async () => {
    if (previousValue === undefined) {
      delete process.env.ENEDIS_USE_2026_APIS;
    } else {
      process.env.ENEDIS_USE_2026_APIS = previousValue;
    }
    await shutdown();
  });
  it('should get daily consumption from the Mesures V1 API', async () => {
    await finalizeOauthProcess();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get('/mesure_synchrone_auto/v1/metering_data/daily_consumption')
      .query(queryParams)
      .reply(200, meteringData);
    const createdSync = await db.t_enedis_sync.insert({
      usage_point_id: queryParams.usage_point_id,
      jobs_total: 1,
    });
    const response = await enedisModel.getDataDailyConsumption(
      ACCOUNT_ID,
      queryParams.usage_point_id,
      queryParams.start,
      queryParams.end,
      createdSync.id,
    );
    expect(response).to.deep.equal(meteringData);
  });
  it('should get the consumption load curve from the Mesures V1 API', async () => {
    await finalizeOauthProcess();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get('/mesure_synchrone_auto/v1/metering_data/consumption_load_curve')
      .query(queryParams)
      .reply(200, meteringData);
    const createdSync = await db.t_enedis_sync.insert({
      usage_point_id: queryParams.usage_point_id,
      jobs_total: 1,
    });
    const response = await enedisModel.getConsumptionLoadCurve(
      ACCOUNT_ID,
      queryParams.usage_point_id,
      queryParams.start,
      queryParams.end,
      createdSync.id,
    );
    expect(response).to.deep.equal(meteringData);
  });
  it('should get the last activation date from the contractual summary API', async () => {
    await finalizeOauthProcess();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get(`/synth_contrat_auto/v1/${queryParams.usage_point_id}`)
      .reply(200, {
        segments: ['C5'],
        consumption_last_activation_date: '2013-08-14T00:00:00+01:00',
        last_subscribed_power_change_date: '2017-05-25T00:00:00+01:00',
        services_level: 2,
      });
    const response = await enedisModel.getContract(ACCOUNT_ID, queryParams.usage_point_id);
    expect(response).to.deep.equal({
      lastActivationDate: '2013-08-14T00:00:00+01:00',
    });
  });
});
