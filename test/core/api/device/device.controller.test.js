const request = require('supertest');
const { expect } = require('chai');
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
        expect(response.body).to.deep.equal([
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
        expect(response.body).to.deep.equal({
          id: '1356c620-0c88-46fc-87bf-de620f30f0e3',
          revoked: true,
        });
      }));
});

describe('POST /devices/:id/revoke (not found)', () => {
  it('should return 404 for a device of another user or an unknown device', async () => {
    await request(TEST_BACKEND_APP)
      .post('/devices/6b0e4a2e-6fd1-4bc5-9b73-8bd6a1a4f4d1/revoke')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(404);
  });
});
