const request = require('supertest');

describe('POST /signup', function() {
  it('should signup one user', function() {
    return request(TEST_BACKEND_APP)
      .post('/signup')
      .send({
        email: 'tony.stark@gladysproject.com',
        language: 'en',
        password: 'thisisabigandsecurepassword'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('id');
        response.body.should.have.property('email_confirmation_token');
        response.body.should.have.property('account_id');
      });
  });
});