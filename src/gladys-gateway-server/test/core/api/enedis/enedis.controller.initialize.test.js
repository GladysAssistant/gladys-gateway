const request = require('supertest');
const { expect } = require('chai');
const configTest = require('../../../tasks/config');

describe('GET /enedis/initialize', () => {
  it('should return redirect uri', async () => {
    const response = await request(TEST_BACKEND_APP)
      .get('/enedis/initialize')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.have.property('redirect_uri');
  });
});
