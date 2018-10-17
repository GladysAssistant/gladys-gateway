const request = require('supertest');
const should = require('should');
const configTest = require('../../../tasks/config');

describe('POST /invitations', function() {
  it('should send invitation', function() {
    return request(TEST_BACKEND_APP)
      .post('/invitations')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'pepper.potts@starkindustries.com',
        role: 'user'
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, { 
          id: response.body.id,
          email: 'pepper.potts@starkindustries.com',
          role: 'user',
          account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
          is_invitation: true,
          created_at: response.body.created_at
        });
      });
  });

  it('should not send invitation, wrong email', function() {
    return request(TEST_BACKEND_APP)
      .post('/invitations')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'pepper.pott'
      })
      .expect('Content-Type', /json/)
      .expect(422)
      .then(response => {
        
      });
  });
});

describe('POST /invitations/accept', function() {
  
  it('should accept invitation', function() {
    return request(TEST_BACKEND_APP)
      .post('/invitations/accept')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        token: 'b429430dfc4c1765ae97b15a76bd41fcef8f58ddf6c1bd19bce034cadc45b88f0a5f45f2f00fe0809aa5dcb8947bd8eb86a177609785d8d73e498b444b534413',
        name: 'Tony',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key'
      })
      .expect('Content-Type', /json/)
      .expect(201)
      .then(response => {
        should.deepEqual(response.body, { 
          status: 201,
          message: 'User created with success.'
        });
      });
  });

  it('should not accept invitation, not found hash', function() {
    return request(TEST_BACKEND_APP)
      .post('/invitations/accept')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        token: 'not-found-hash',
        name: 'Tony',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key'
      })
      .expect('Content-Type', /json/)
      .expect(404)
      .then(response => {
        
      });
  });

  it('should not accept invitation, missing data', function() {
    return request(TEST_BACKEND_APP)
      .post('/invitations/accept')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        token: 'b429430dfc4c1765ae97b15a76bd41fcef8f58ddf6c1bd19bce034cadc45b88f0a5f45f2f00fe0809aa5dcb8947bd8eb86a177609785d8d73e498b444b534413',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key'
      })
      .expect('Content-Type', /json/)
      .expect(422)
      .then(response => {
        
      });
  });
});


describe('GET /invitations/:id', function() {
  it('should get invitation', function() {
    return request(TEST_BACKEND_APP)
      .get('/invitations/' + 'b429430dfc4c1765ae97b15a76bd41fcef8f58ddf6c1bd19bce034cadc45b88f0a5f45f2f00fe0809aa5dcb8947bd8eb86a177609785d8d73e498b444b534413')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, { 
          email: 'oneuserinvited@gladysproject.com',
          id: 'b141f826-5e43-4aa6-807e-a37d4e9177de'
        });
      });
  });
});

describe('POST /invitations/:id/revoke', function() {
  it('should revoke invitation', function() {
    return request(TEST_BACKEND_APP)
      .post('/invitations/b141f826-5e43-4aa6-807e-a37d4e9177de/revoke')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, { 
          success: true
        });
      });
  });
});