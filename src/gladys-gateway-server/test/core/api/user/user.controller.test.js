const request = require('supertest');

describe('POST /signup', function() {
  it('should signup one user', function() {
    return request(TEST_BACKEND_APP)
      .post('/signup')
      .send({
        email: 'tony.stark@gladysproject.com',
        language: 'en',
        password: 'thisisabigandsecurepassword',
        public_key: 'public-key',
        encrypted_private_key: 'this-is-the-encrypted-private-key'
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

describe('POST /users/verify', function() {
  it('should verify one user email', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/verify')
      .send({
        email_confirmation_token: 'VKaUQRKsEAQPAizrzYlqnFqZiR0vB8vy9nfayj/FMm31Hz2G16o3YA5vcN2ZzntyeCX7qBvLNrqGMAeLTHVz1w=='
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, {
          id: '29770e0d-26a9-444e-91a1-f175c99a5218',
          email_confirmed: true
        });
      });
  });
});