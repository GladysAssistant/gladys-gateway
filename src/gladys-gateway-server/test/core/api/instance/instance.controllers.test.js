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
          primary_instance: true,
          rsa_public_key: 'public-key',
          ecdsa_public_key: 'public-key'
        }]);
      });
  });
});

describe('GET /instances/:id', function() {
  it('should return instance by ID', function() {

    return request(TEST_BACKEND_APP)
      .get('/instances/0bc53f3c-1e11-40d3-99a4-bd392a666eaf')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, {
          id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
          name: 'Raspberry Pi 1',
          rsa_public_key: 'public-key',
          primary_instance: true,
          ecdsa_public_key: 'public-key',
          rsa_fingerprint: '43:a4:6f:1d:08:1d:27:01:30:e2:21:0a:1d:e5:9f:97:15:de:03:33:07:d0:68:ed:c6:5a:33:5b:27:e9:5d:3d',
          ecdsa_fingerprint: '43:a4:6f:1d:08:1d:27:01:30:e2:21:0a:1d:e5:9f:97:15:de:03:33:07:d0:68:ed:c6:5a:33:5b:27:e9:5d:3d'
        });
      });
  });
});

describe('POST /instances', function() {
  it('should create one instance', function() {

    return request(TEST_BACKEND_APP)
      .post('/instances')
      .send({
        name: 'rasp',
        rsa_public_key: 'hey',
        ecdsa_public_key: 'hey'
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

describe('GET /instances/access-token', function() {
  it('should return a new access token', function() {

    return request(TEST_BACKEND_APP)
      .get('/instances/access-token')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtRefreshTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('access_token');
      });
  });
});

describe('GET /instances/users', function() {
  it('should return list of users in instance with their public keys', function() {

    return request(TEST_BACKEND_APP)
      .get('/instances/users')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.forEach((user) => {
          user.should.have.property('id');
          user.should.have.property('rsa_public_key');
          user.should.have.property('ecdsa_public_key');
        });
      });
  });
});