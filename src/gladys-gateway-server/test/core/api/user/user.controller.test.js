const request = require('supertest');

describe('POST /users/signup', function() {
  it('should signup one user', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/signup')
      .send({
        name: 'Tony',
        email: 'tony.stark@gladysproject.com',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        public_key: 'public-key',
        encrypted_private_key: 'this-is-the-encrypted-private-key'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(201)
      .then(response => {
        should.deepEqual(response.body, { 
          status: 201,
          message: 'User created with success. You need now to confirm your email.' 
        });
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

describe('POST /users/login-salt', function() {
  it('should return a salt', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/login-salt')
      .send({
        email: 'email-confirmed@gladysprojet.com'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, {
          srp_salt: 'e0812f8c57be08780bafcc7e2cbacd155b6f63962114c12cc12462a7aa669fdb'
        });
      });
  });
  it('should return 404 not found', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/login-salt')
      .send({
        email: 'this-email-doesnt-exist@gladysprojet.com'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(404)
      .then(response => {
        
      });
  });
});

describe('POST /users/login-generate-ephemeral', function() {
  it('should return a salt', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/login-generate-ephemeral')
      .send({
        email: 'email-confirmed@gladysprojet.com',
        client_ephemeral_public: 'heyheyhey'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('server_ephemeral_public');
        response.body.should.have.property('login_session_key');
      });
  });
  it('should return 404 not found', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/login-generate-ephemeral')
      .send({
        email: 'this-email-doesnt-exist@gladysprojet.com'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(404)
      .then(response => {
        
      });
  });
});

describe('POST /users/login-finalize', function() {
  var srpFixture = require('../../../tasks/srp-fixture.json');
  it('should return a server_session_proof and access_token', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/login-finalize')
      .send({
        login_session_key: '2b2aa099-4323-44e8-bb07-0b9b55dbe1dc',
        client_session_proof: srpFixture.clientSession.proof
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('server_session_proof');
        response.body.should.have.property('access_token');
      });
  });
});