const request = require('supertest');
const configTest = require('../../../tasks/config');

describe('GET /users/me/devices', () => {
  it('should get devices', () =>
    request(TEST_BACKEND_APP)
      .get('/users/me/devices')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, [
          {
            id: '1356c620-0c88-46fc-87bf-de620f30f0e3',
            name: 'Safari Tony Stark',
            created_at: '2018-10-16T02:21:25.901Z',
            last_seen: '2018-10-16T02:21:25.901Z',
          },
        ]);
      }));
});

describe('POST /devices/:id/revoke', () => {
  it('should revoke device', () =>
    request(TEST_BACKEND_APP)
      .post('/devices/1356c620-0c88-46fc-87bf-de620f30f0e3/revoke')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, {
          id: '1356c620-0c88-46fc-87bf-de620f30f0e3',
          revoked: true,
        });
      }));
});
