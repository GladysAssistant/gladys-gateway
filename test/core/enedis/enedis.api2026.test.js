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

// Query params of Mesures V2
const queryParamsV2 = {
  pointId: queryParams.usage_point_id,
  dateDebut: queryParams.start,
  dateFin: queryParams.end,
};

// Response shapes of the Enedis swagger (ReponseMesureAccesQuotidien / ReponseMesureAccesCDC)
const dailyConsumptionData = {
  idPrm: queryParams.usage_point_id,
  etapeMetier: 'BRUT',
  periode: { dateDebut: queryParams.start, dateFin: queryParams.end },
  modeCalcul: 'DIFF.INDEX',
  pas: 'P1D',
  grandeur: [
    {
      grandeurMetier: 'CONS',
      grandeurPhysique: 'EA',
      unite: 'Wh',
      points: [
        { v: '12000', d: '2022-08-01' },
        { v: '13000', d: '2022-08-02T00:00:00+02:00' },
      ],
      calendrier: [],
    },
  ],
  contexte: [],
};

const loadCurveData = {
  idPrm: queryParams.usage_point_id,
  etapeMetier: 'BRUT',
  periode: { dateDebut: queryParams.start, dateFin: queryParams.end },
  modeCalcul: 'MESURE',
  grandeur: [
    {
      grandeurMetier: 'CONS',
      grandeurPhysique: 'PA',
      unite: 'W',
      points: [
        { v: '100', d: '2022-08-01 00:30:00', p: 'PT30M' },
        { v: '200', d: '2022-08-01T01:00:00+02:00', p: 'PT30M' },
      ],
      calendrier: [],
    },
    {
      grandeurMetier: 'PROD',
      grandeurPhysique: 'PA',
      unite: 'W',
      points: [{ v: '999', d: '2022-08-01 01:30:00', p: 'PT30M' }],
      calendrier: [],
    },
  ],
  contexte: [],
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
  it('should get daily consumption from the Mesures V2 API', async () => {
    await finalizeOauthProcess();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get('/mesure_synchrone_auto/v2/consommation_quotidienne')
      .query(queryParamsV2)
      .reply(200, dailyConsumptionData);
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
    expect(response).to.deep.equal(dailyConsumptionData);
    const rows = await db.query(
      `SELECT value, created_at::text FROM t_enedis_daily_consumption
       WHERE usage_point_id = $1 AND created_at >= '2022-08-01' AND created_at < '2022-08-03'
       ORDER BY created_at ASC`,
      [queryParams.usage_point_id],
    );
    expect(rows).to.deep.equal([
      { value: 12000, created_at: '2022-08-01' },
      { value: 13000, created_at: '2022-08-02' },
    ]);
    const sync = await db.t_enedis_sync.findOne({ id: createdSync.id });
    expect(sync.jobs_done).to.equal(1);
  });
  it('should get the consumption load curve from the Mesures V2 API', async () => {
    await finalizeOauthProcess();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get('/mesure_synchrone_auto/v2/courbe_de_charge_consommation')
      .query(queryParamsV2)
      .reply(200, loadCurveData);
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
    expect(response).to.deep.equal(loadCurveData);
    // Only the consumption series is saved. A date without offset is a french local time,
    // a date with an offset is absolute: both points are stored at the right instant.
    const rows = await db.query(
      `SELECT value, created_at FROM t_enedis_consumption_load_curve
       WHERE usage_point_id = $1 AND created_at >= '2022-07-31T22:00:00Z' AND created_at < '2022-08-01T22:00:00Z'
       ORDER BY created_at ASC`,
      [queryParams.usage_point_id],
    );
    expect(rows.map((row) => ({ value: row.value, created_at: row.created_at.toISOString() }))).to.deep.equal([
      { value: 100, created_at: '2022-07-31T22:30:00.000Z' },
      { value: 200, created_at: '2022-07-31T23:00:00.000Z' },
    ]);
  });
  it('should save nothing and count the job as done when the daily consumption has no grandeur', async () => {
    await finalizeOauthProcess();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get('/mesure_synchrone_auto/v2/consommation_quotidienne')
      .query({ ...queryParamsV2, dateDebut: '2022-09-01', dateFin: '2022-09-03' })
      .reply(200, { idPrm: queryParams.usage_point_id, periode: { dateDebut: '2022-09-01', dateFin: '2022-09-03' } });
    const createdSync = await db.t_enedis_sync.insert({
      usage_point_id: queryParams.usage_point_id,
      jobs_total: 1,
    });
    await enedisModel.getDataDailyConsumption(
      ACCOUNT_ID,
      queryParams.usage_point_id,
      '2022-09-01',
      '2022-09-03',
      createdSync.id,
    );
    const rows = await db.query(
      `SELECT value FROM t_enedis_daily_consumption
       WHERE usage_point_id = $1 AND created_at >= '2022-09-01' AND created_at < '2022-09-03'`,
      [queryParams.usage_point_id],
    );
    expect(rows).to.have.lengthOf(0);
    const sync = await db.t_enedis_sync.findOne({ id: createdSync.id });
    expect(sync.jobs_done).to.equal(1);
  });
  it('should save nothing and count the job as done when the load curve has no consumption series', async () => {
    await finalizeOauthProcess();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get('/mesure_synchrone_auto/v2/courbe_de_charge_consommation')
      .query({ ...queryParamsV2, dateDebut: '2022-09-01', dateFin: '2022-09-03' })
      .reply(200, {
        ...loadCurveData,
        grandeur: [
          { grandeurMetier: 'CONS', grandeurPhysique: 'PA', unite: 'W', calendrier: [] },
          {
            grandeurMetier: 'PROD',
            grandeurPhysique: 'PA',
            unite: 'W',
            points: [{ v: '999', d: '2022-09-01 01:30:00' }],
          },
        ],
      });
    const createdSync = await db.t_enedis_sync.insert({
      usage_point_id: queryParams.usage_point_id,
      jobs_total: 1,
    });
    await enedisModel.getConsumptionLoadCurve(
      ACCOUNT_ID,
      queryParams.usage_point_id,
      '2022-09-01',
      '2022-09-03',
      createdSync.id,
    );
    const rows = await db.query(
      `SELECT value FROM t_enedis_consumption_load_curve
       WHERE usage_point_id = $1 AND created_at >= '2022-08-31T22:00:00Z' AND created_at < '2022-09-02T22:00:00Z'`,
      [queryParams.usage_point_id],
    );
    expect(rows).to.have.lengthOf(0);
    const sync = await db.t_enedis_sync.findOne({ id: createdSync.id });
    expect(sync.jobs_done).to.equal(1);
  });
  it('should count the job as done when Mesures V2 has no data for the period', async () => {
    await finalizeOauthProcess();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get('/mesure_synchrone_auto/v2/consommation_quotidienne')
      .query(queryParamsV2)
      .reply(404, { code: 'ADAM-ERR0123', message: 'Pas de mesure trouvée pour ce point' });
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
    expect(response).to.equal(null);
    const sync = await db.t_enedis_sync.findOne({ id: createdSync.id });
    expect(sync.jobs_done).to.equal(1);
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
