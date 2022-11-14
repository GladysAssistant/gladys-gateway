const request = require('supertest');
const should = require('should');
const configTest = require('../../../tasks/config');

describe('POST /open-api-keys', () => {
  it('should create a new open api key', () =>
    request(TEST_BACKEND_APP)
      .post('/open-api-keys')
      .send({
        name: 'My new api key',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('api_key');
        response.body.should.have.property('name', 'My new api key');
      }));

  it('should not create a new open api key (missing name)', () =>
    request(TEST_BACKEND_APP)
      .post('/open-api-keys')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(422));
});

describe('GET /open-api-keys', () => {
  it('should get list of existing api key', () =>
    request(TEST_BACKEND_APP)
      .get('/open-api-keys')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, [
          {
            id: '4a01dfc5-899e-4a95-9288-c6096f1be180',
            name: 'Open API Key',
            created_at: '2019-01-28T04:24:25.824Z',
            last_used: '2019-01-28T04:24:25.824Z',
          },
        ]);
      }));
});

describe('DELETE /open-api-keys/:id', () => {
  it('should revoke api key', () =>
    request(TEST_BACKEND_APP)
      .delete('/open-api-keys/4a01dfc5-899e-4a95-9288-c6096f1be180')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200));
});

describe('PATCH /open-api-keys/:id', () => {
  it('should update name api key', () =>
    request(TEST_BACKEND_APP)
      .patch('/open-api-keys/4a01dfc5-899e-4a95-9288-c6096f1be180')
      .send({
        name: 'new-name',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('name', 'new-name');
      }));
});
