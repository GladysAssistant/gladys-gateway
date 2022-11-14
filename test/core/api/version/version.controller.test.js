const request = require('supertest');
const should = require('should');

describe('GET /v1/api/gladys/version', () => {
  it('should return status 200', () =>
    request(TEST_BACKEND_APP)
      .get('/v1/api/gladys/version')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        should.deepEqual(res.body, {
          name: 'v4.0.0-alpha',
          created_at: '2018-10-16T02:21:25.901Z',
        });
      }));
});

describe('POST /v1/api/gladys/version', () => {
  it('should return status 200', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/gladys/version')
      .set('Accept', 'application/json')
      .send({
        is_docker: true,
        device_state_count: 10,
        node_version: 'v14.10.0',
        integrations: {
          zwave: true,
          zigbee: true,
        },
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        should.deepEqual(res.body, {
          name: 'v4.0.0-alpha',
          created_at: '2018-10-16T02:21:25.901Z',
        });
      }));
});
