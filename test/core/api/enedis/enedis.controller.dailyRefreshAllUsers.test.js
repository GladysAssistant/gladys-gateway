const request = require('supertest');
const { expect } = require('chai');

describe('POST /admin/api/enedis/daily_refresh', () => {
  it('should post job in bull', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/admin/api/enedis/daily_refresh')
      .set('Accept', 'application/json')
      .set('Authorization', process.env.ADMIN_API_AUTHORIZATION_TOKEN)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.have.property('success', true);
  });
});
