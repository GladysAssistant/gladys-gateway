const request = require('supertest');
const should = require('should');
const configTest = require('../../../tasks/config');

describe('GET /instances', function() {
  it('should return list of instances', function() {

    return request(TEST_BACKEND_APP)
      .get('/instances')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, [{
          id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
          name: 'Raspberry Pi 1',
          public_key: 'public-key'
        }]);
      });
  });
});

describe('POST /instances', function() {
  it('should create one instance', function() {

    return request(TEST_BACKEND_APP)
      .post('/instances')
      .send({
        name: 'rasp',
        public_key: 'hey'
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(201)
      .then(response => {
        response.body.should.have.property('access_token');
        response.body.should.have.property('refresh_token');
        response.body.should.have.property('id');
      });
  });
});