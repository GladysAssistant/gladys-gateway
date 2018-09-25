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