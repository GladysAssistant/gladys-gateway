const request = require('supertest');
const configTest = require('../../../tasks/config');

describe('GET /accounts/users', function() {
  it('should return all users in same account as me', function() {
    return request(TEST_BACKEND_APP)
      .get('/accounts/users')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.be.instanceOf(Array);
        response.body.forEach((user) => {
          user.should.have.property('id');
          user.should.have.property('name');
          user.should.have.property('email');
        });
      });
  });
});