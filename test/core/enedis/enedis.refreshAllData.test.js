const request = require('supertest');
const { expect } = require('chai');
const dayjs = require('dayjs');
const nock = require('nock');
const configTest = require('../../tasks/config');
const { mockAccessTokenRefresh } = require('./utils.test');
const { initEnedisListener } = require('../../../core/enedis/enedisListener');

const contractQueryParams = {
  usage_point_id: '16401220101758',
};

const contractData = {
  segments: ['C5'],
  consumption_last_activation_date: '2013-08-14T00:00:00+01:00',
  last_subscribed_power_change_date: '2017-05-25T00:00:00+01:00',
  services_level: 2,
};

describe('EnedisWorker.refreshAllData', function Describe() {
  this.timeout(5000);
  let enedisModel;
  let shutdown;
  let db;
  before(async () => {
    ({ enedisModel, shutdown, db } = await initEnedisListener());
    await shutdown();
  });
  it('should publish one job per week', async () => {
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
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get(`/synth_contrat_auto/v1/${contractQueryParams.usage_point_id}`)
      .reply(200, contractData);
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        code: 'someAuthCode',
        usage_points_id: ['16401220101758'],
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    mockAccessTokenRefresh();
    await enedisModel.refreshAllData({ userId: '29770e0d-26a9-444e-91a1-f175c99a5218' });
    const counts = await enedisModel.queue.getJobCounts('wait', 'completed', 'failed');
    expect(counts).to.deep.equal({ wait: 210, completed: 0, failed: 0 });
    const syncs = await db.t_enedis_sync.find(
      {},
      {
        fields: ['usage_point_id', 'jobs_done', 'jobs_total'],
      },
    );
    expect(syncs).to.deep.equal([
      {
        usage_point_id: '16401220101758',
        jobs_done: 0,
        jobs_total: 210,
      },
    ]);
  });
  it('should only sync last week', async () => {
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
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get(`/synth_contrat_auto/v1/${contractQueryParams.usage_point_id}`)
      .reply(200, {
        segments: ['C5'],
        consumption_last_activation_date: dayjs().subtract(1, 'week').toISOString(),
        last_subscribed_power_change_date: '2017-05-25T00:00:00+01:00',
        services_level: 2,
      });
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        code: 'someAuthCode',
        usage_points_id: ['16401220101758'],
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    mockAccessTokenRefresh();
    await enedisModel.refreshAllData({ userId: '29770e0d-26a9-444e-91a1-f175c99a5218' });
    const counts = await enedisModel.queue.getJobCounts('wait', 'completed', 'failed');
    expect(counts).to.deep.equal({ wait: 4, completed: 0, failed: 0 });
    const syncs = await db.t_enedis_sync.find(
      {},
      {
        fields: ['usage_point_id', 'jobs_done', 'jobs_total'],
      },
    );
    expect(syncs).to.deep.equal([
      {
        usage_point_id: '16401220101758',
        jobs_done: 0,
        jobs_total: 4,
      },
    ]);
  });
  it('should play job', async () => {
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
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get(`/synth_contrat_auto/v1/${contractQueryParams.usage_point_id}`)
      .reply(200, contractData);
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        code: 'someAuthCode',
        usage_points_id: ['16401220101758'],
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    mockAccessTokenRefresh();
    await enedisModel.enedisSyncData({
      name: 'refresh-all-data',
      data: { userId: '29770e0d-26a9-444e-91a1-f175c99a5218' },
    });
    const counts = await enedisModel.queue.getJobCounts('wait', 'completed', 'failed');
    expect(counts).to.deep.equal({ wait: 210, completed: 0, failed: 0 });
  });
});
