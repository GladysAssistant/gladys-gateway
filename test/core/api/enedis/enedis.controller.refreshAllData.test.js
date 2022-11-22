const request = require('supertest');
const { expect } = require('chai');
const configTest = require('../../../tasks/config');

describe('POST /enedis/refresh_all', () => {
  it('should post job in bull', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/enedis/refresh_all')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.have.property('success', true);
  });
});
