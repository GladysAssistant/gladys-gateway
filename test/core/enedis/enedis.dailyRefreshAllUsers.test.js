const request = require('supertest');
const { expect } = require('chai');
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

describe('EnedisWorker.dailyRefreshAllUsers', function Describe() {
  this.timeout(5000);
  let enedisModel;
  let shutdown;
  before(async () => {
    ({ enedisModel, shutdown } = await initEnedisListener());
    await shutdown();
  });
  it('should publish 2 jobs', async () => {
    // Insert broken enedis user data
    await TEST_DATABASE_INSTANCE.t_account.insert({
      id: 'ab9c205a-d090-4c97-84b5-d2a9eb932201',
      name: 'user_with_broken_enedis_sync@test.fr',
      current_period_end: new Date('2050-11-19T16:00:00.000Z'),
      status: 'active',
    });
    await TEST_DATABASE_INSTANCE.t_user.insert({
      id: '1258b0b1-4f5a-4ea6-926b-755ab725eeb3',
      email_confirmation_token_hash: 'dlkflmdskflmdskfmldskfkdsfldsfldksmfkdslfksdf',
      email: 'user_with_broken_enedis_sync@test.fr',
      email_confirmed: true,
      srp_salt: 'ddd',
      srp_verifier: 'sdfsdf',
      two_factor_enabled: false,
      role: 'admin',
      account_id: 'ab9c205a-d090-4c97-84b5-d2a9eb932201',
      language: 'fr',
      name: 'Broken Enedis',
    });
    await TEST_DATABASE_INSTANCE.t_device.insert({
      id: '002a93b7-e21b-48bb-a414-29bcc31615ba',
      user_id: '1258b0b1-4f5a-4ea6-926b-755ab725eeb3',
      client_id: process.env.ENEDIS_GRANT_CLIENT_ID,
      name: 'Enedis',
      refresh_token_hash: 'a43fc595dfbf78cf52e644cd30e4cb45ad1f4ef2472c6819cf4546afdece8888',
      created_at: '2024-10-16T02:21:25.901Z',
      last_seen: '2024-10-16T02:21:25.901Z',
    });
    await TEST_DATABASE_INSTANCE.t_enedis_usage_point.insert({
      account_id: 'ab9c205a-d090-4c97-84b5-d2a9eb932201',
      usage_point_id: 'broken-usage-point',
    });
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

    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get('/customers_upc/v5/usage_points/contracts')
      .query(contractQueryParams)
      .reply(200, contractData);
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .get('/customers_upc/v5/usage_points/contracts')
      .query({ usage_point_id: 'broken-usage-point' })
      .reply(403, {
        error: 'ERRE001150',
        error_description: 'No consent can be found for this customer and this usage point.',
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
    mockAccessTokenRefresh();
    await enedisModel.dailyRefreshOfAllUsers();
    const counts = await enedisModel.queue.getJobCounts('wait', 'completed', 'failed');
    expect(counts).to.deep.equal({ wait: 2, completed: 0, failed: 0 });
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
        usage_points_id: '16401220101758,16401220101710,16401220101720',
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
      name: 'daily-refresh-all-users',
      data: {},
    });
    const counts = await enedisModel.queue.getJobCounts('wait', 'completed', 'failed');
    expect(counts).to.deep.equal({ wait: 2, completed: 0, failed: 0 });
  });
});
