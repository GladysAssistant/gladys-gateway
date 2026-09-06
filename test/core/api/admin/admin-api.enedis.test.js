const request = require('supertest');
const { expect } = require('chai');

const ACCOUNT_WITH_USERS = 'b2d23f66-487d-493f-8acb-9c8adb400def';
const ACCOUNT_WITHOUT_USER = 'be2b9666-5c72-451e-98f4-efca76ffef54';

function adminRequest(method, url) {
  const req = request(TEST_BACKEND_APP);
  return req[method](url)
    .set('Accept', 'application/json')
    .set('X-Admin-Api-Key', process.env.ADMIN_API_AUTHORIZATION_TOKEN);
}

describe('GET /admin/api/accounts/:id/enedis', () => {
  it('should return the sync state of each usage point', async () => {
    await TEST_DATABASE_INSTANCE.t_enedis_usage_point.insert({
      usage_point_id: '1111111111',
      account_id: ACCOUNT_WITH_USERS,
    });
    await TEST_DATABASE_INSTANCE.t_enedis_usage_point.insert({
      usage_point_id: '2222222222',
      account_id: ACCOUNT_WITH_USERS,
    });
    await TEST_DATABASE_INSTANCE.t_enedis_sync.insert({
      usage_point_id: '1111111111',
      jobs_done: 2,
      jobs_total: 2,
      created_at: '2025-02-05 05:00:00+00',
    });
    await TEST_DATABASE_INSTANCE.t_enedis_sync.insert({
      usage_point_id: '1111111111',
      jobs_done: 1,
      jobs_total: 2,
      created_at: '2025-02-06 05:00:00+00',
    });
    await TEST_DATABASE_INSTANCE.t_enedis_daily_consumption.insert([
      { usage_point_id: '1111111111', value: 1, created_at: '2025-02-05' },
      { usage_point_id: '1111111111', value: 2, created_at: '2025-02-06' },
    ]);
    await TEST_DATABASE_INSTANCE.t_enedis_consumption_load_curve.insert([
      { usage_point_id: '1111111111', value: 1, created_at: '2025-02-06 18:00:00+00' },
      { usage_point_id: '1111111111', value: 1, created_at: '2025-02-06 18:30:00+00' },
      { usage_point_id: '1111111111', value: 1, created_at: '2025-02-06 19:00:00+00' },
    ]);

    const response = await adminRequest('get', `/admin/api/accounts/${ACCOUNT_WITH_USERS}/enedis`)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body.usage_points).to.have.lengthOf(2);
    const [first, second] = response.body.usage_points;
    expect(first.usage_point_id).to.equal('1111111111');
    // most recent sync first
    expect(first.syncs).to.have.lengthOf(2);
    expect(first.syncs[0]).to.include({ jobs_done: 1, jobs_total: 2 });
    expect(first.syncs[1]).to.include({ jobs_done: 2, jobs_total: 2 });
    expect(first.daily_consumption.count).to.equal(2);
    expect(first.daily_consumption.last_date).to.match(/^2025-02-06/);
    expect(first.consumption_load_curve).to.deep.equal({ count: 3, last_date: '2025-02-06T19:00:00.000Z' });
    expect(second.usage_point_id).to.equal('2222222222');
    expect(second.syncs).to.have.lengthOf(0);
    expect(second.daily_consumption).to.deep.equal({ count: 0, last_date: null });
    expect(second.consumption_load_curve).to.deep.equal({ count: 0, last_date: null });
  });

  it('should return an empty list when the account has no usage point', async () => {
    const response = await adminRequest('get', `/admin/api/accounts/${ACCOUNT_WITH_USERS}/enedis`).expect(200);
    expect(response.body).to.deep.equal({ usage_points: [] });
  });

  it('should return 404 for an unknown account', async () => {
    await adminRequest('get', '/admin/api/accounts/6b0e4a2e-6fd1-4bc5-9b73-8bd6a1a4f4d1/enedis').expect(404);
  });
});

describe('POST /admin/api/accounts/:id/enedis/refresh', () => {
  it('should queue a full refresh of the account data', async () => {
    const response = await adminRequest('post', `/admin/api/accounts/${ACCOUNT_WITH_USERS}/enedis/refresh`)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({ success: true });
  });

  it('should ignore revoked users when picking the user of the job', async () => {
    await TEST_DATABASE_INSTANCE.t_user.insert({
      email: 'revoked-user@gladysassistant.com',
      email_confirmation_token_hash: 'hash',
      language: 'fr',
      role: 'admin',
      account_id: ACCOUNT_WITHOUT_USER,
      is_deleted: true,
    });
    await adminRequest('post', `/admin/api/accounts/${ACCOUNT_WITHOUT_USER}/enedis/refresh`).expect(404);
  });

  it('should return 404 when the account has no user', async () => {
    await adminRequest('post', `/admin/api/accounts/${ACCOUNT_WITHOUT_USER}/enedis/refresh`).expect(404);
  });

  it('should return 404 for an unknown account', async () => {
    await adminRequest('post', '/admin/api/accounts/6b0e4a2e-6fd1-4bc5-9b73-8bd6a1a4f4d1/enedis/refresh').expect(404);
  });
});
