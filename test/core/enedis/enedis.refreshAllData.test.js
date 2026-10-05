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
  customer: {
    customer_id: '1358019319',
    usage_points: [
      {
        usage_point: {
          usage_point_id: '16401220101758',
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
      .get('/customers_upc/v5/usage_points/contracts')
      .query(contractQueryParams)
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
      .get('/customers_upc/v5/usage_points/contracts')
      .query(contractQueryParams)
      .reply(200, {
        customer: {
          customer_id: '1358019319',
          usage_points: [
            {
              usage_point: {
                usage_point_id: '16401220101758',
                usage_point_status: 'com',
                meter_type: 'AMM',
              },
              contracts: {
                segment: 'C5',
                subscribed_power: '9 kVA',
                last_activation_date: dayjs().subtract(1, 'week').toISOString(),
                distribution_tariff: 'BTINFCUST',
                offpeak_hours: 'HC (23h00-7h30)',
                contract_type: 'CRAE',
                contract_status: 'SERVC',
                last_distribution_tariff_change_date: '2017-05-25+01:00',
              },
            },
          ],
        },
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
    // The meter was activated one week ago: one slice of 7 days. The slice that would
    // start and end on the activation day is empty, and Enedis rejects it, so it is skipped.
    const counts = await enedisModel.queue.getJobCounts('wait', 'completed', 'failed');
    expect(counts).to.deep.equal({ wait: 2, completed: 0, failed: 0 });
    const jobs = await enedisModel.queue.getJobs(['wait']);
    jobs.forEach((job) => {
      expect(job.data.start).to.not.equal(job.data.end);
    });
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
        jobs_total: 2,
      },
    ]);
  });
  it('should space the contract calls of an account with several usage points', async () => {
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/oauth2/v3/token', (body) => body.grant_type === 'authorization_code')
      .reply(200, {
        access_token: 'ba42fe5a-0eaa-11e5-9813-4dd05b3a25f3',
        token_type: 'Bearer',
        expires_in: 12600,
        refresh_token: '7dnCbf8P0ypCyxbnX7tUKjcSveE2Nu8w',
      });
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        code: 'someAuthCode',
        usage_points_id: ['16401220101758', '16401220101710'],
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    mockAccessTokenRefresh();
    const contractCallTimes = [];
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get('/customers_upc/v5/usage_points/contracts')
      .query(true)
      .times(2)
      .reply(() => {
        contractCallTimes.push(Date.now());
        return [200, contractData];
      });
    await enedisModel.refreshAllData({ userId: '29770e0d-26a9-444e-91a1-f175c99a5218' });
    expect(contractCallTimes).to.have.lengthOf(2);
    expect(contractCallTimes[1] - contractCallTimes[0]).to.be.at.least(240);
    // Both usage points are synced
    const syncs = await db.t_enedis_sync.find({}, { fields: ['usage_point_id'] });
    expect(syncs.map((sync) => sync.usage_point_id)).to.have.members(['16401220101758', '16401220101710']);
  });
  it('should fail without publishing anything when the contract call is rate limited', async () => {
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/oauth2/v3/token', (body) => body.grant_type === 'authorization_code')
      .reply(200, {
        access_token: 'ba42fe5a-0eaa-11e5-9813-4dd05b3a25f3',
        token_type: 'Bearer',
        expires_in: 12600,
        refresh_token: '7dnCbf8P0ypCyxbnX7tUKjcSveE2Nu8w',
      });
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        code: 'someAuthCode',
        usage_points_id: ['16401220101758'],
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    mockAccessTokenRefresh();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get('/customers_upc/v5/usage_points/contracts')
      .query(contractQueryParams)
      .reply(429, { code: 'SLA', message: 'SLA dépassé' });
    let error;
    try {
      await enedisModel.refreshAllData({ userId: '29770e0d-26a9-444e-91a1-f175c99a5218' });
    } catch (e) {
      error = e;
    }
    // The 429 reaches the job processor, which pauses the queue, and nothing was published
    expect(error.response.status).to.equal(429);
    const counts = await enedisModel.queue.getJobCounts('wait', 'completed', 'failed');
    expect(counts).to.deep.equal({ wait: 0, completed: 0, failed: 0 });
    const syncs = await db.t_enedis_sync.find({});
    expect(syncs).to.have.lengthOf(0);
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
      .get('/customers_upc/v5/usage_points/contracts')
      .query(contractQueryParams)
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
