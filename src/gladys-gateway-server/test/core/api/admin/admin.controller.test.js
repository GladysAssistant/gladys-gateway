const request = require('supertest');
const configTest = require('../../../tasks/config');

describe('POST /admin/accounts/:id/resend', function() {
  it('should send again email to subscribers', function() {
    process.env.SUPER_ADMIN_USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
    return request(TEST_BACKEND_APP)
      .post('/admin/accounts/be2b9666-5c72-451e-98f4-efca76ffef54/resend')
      .send({
        language: 'fr'
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('status', 200);
      });
  });
});

describe('GET /admin/accounts', function() {
  it('should return all accounts', function() {
    process.env.SUPER_ADMIN_USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
    return request(TEST_BACKEND_APP)
      .get('/admin/accounts')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.forEach((account) => {
          account.should.have.property('id');
          account.should.have.property('user_count');
        });
      });
  });

  it('should return 401', function() {
    process.env.SUPER_ADMIN_USER_ID = 'other_id';
    return request(TEST_BACKEND_APP)
      .get('/admin/accounts')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(401)
      .then(response => {
        
      });
  });
});