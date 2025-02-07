const request = require('supertest');
const configTest = require('../../../tasks/config');

describe('POST /admin/accounts/:id/resend', () => {
  it('should send again email to subscribers', () => {
    process.env.SUPER_ADMIN_USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
    return request(TEST_BACKEND_APP)
      .post('/admin/accounts/be2b9666-5c72-451e-98f4-efca76ffef54/resend')
      .send({
        language: 'fr',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('status', 200);
      });
  });
});

describe('DELETE /admin/accounts/:id', () => {
  it('should delete account', async function Test() {
    this.timeout(5000);
    process.env.SUPER_ADMIN_USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
    await TEST_DATABASE_INSTANCE.t_enedis_usage_point.insert({
      usage_point_id: '1111111111',
      account_id: 'be2b9666-5c72-451e-98f4-efca76ffef54',
      created_at: '2023-12-29 05:29:50.908699+00',
    });
    await TEST_DATABASE_INSTANCE.t_enedis_sync.insert({
      usage_point_id: '1111111111',
      jobs_done: 0,
      jobs_total: 2,
    });
    await TEST_DATABASE_INSTANCE.t_enedis_daily_consumption.insert({
      usage_point_id: '1111111111',
      value: 1,
      created_at: '2025-02-06',
    });
    await TEST_DATABASE_INSTANCE.t_enedis_consumption_load_curve.insert({
      usage_point_id: '1111111111',
      value: 1,
      created_at: '2022-11-28 18:00:00+00',
    });
    return request(TEST_BACKEND_APP)
      .delete('/admin/accounts/be2b9666-5c72-451e-98f4-efca76ffef54')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('status', 200);
      });
  });
});

describe('GET /admin/accounts', () => {
  it('should return all accounts', () => {
    process.env.SUPER_ADMIN_USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
    return request(TEST_BACKEND_APP)
      .get('/admin/accounts')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.forEach((account) => {
          account.should.have.property('id');
          account.should.have.property('user_count');
        });
      });
  });

  it('should return 401', () => {
    process.env.SUPER_ADMIN_USER_ID = 'other_id';
    return request(TEST_BACKEND_APP)
      .get('/admin/accounts')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(401)
      .then((response) => {});
  });
});
