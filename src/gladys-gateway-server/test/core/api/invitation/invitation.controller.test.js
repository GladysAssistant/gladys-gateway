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
        email: 'pepper.potts@starkindustries.com'
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, { 
          email: 'pepper.potts@starkindustries.com',
          account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def' 
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
        token: 'sWCYa6btbsCmrrZPMIshoEy2TEQdjbz/4tGIRl/pfeS1s91Zs/+7egQ36lk5cZTZwGUy5uli3hLYcR4hipST+w==',
        name: 'Tony',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        public_key: 'public-key',
        encrypted_private_key: 'this-is-the-encrypted-private-key'
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
        public_key: 'public-key',
        encrypted_private_key: 'this-is-the-encrypted-private-key'
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
        token: 'sWCYa6btbsCmrrZPMIshoEy2TEQdjbz/4tGIRl/pfeS1s91Zs/+7egQ36lk5cZTZwGUy5uli3hLYcR4hipST+w==',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        public_key: 'public-key',
        encrypted_private_key: 'this-is-the-encrypted-private-key'
      })
      .expect('Content-Type', /json/)
      .expect(422)
      .then(response => {
        
      });
  });
});