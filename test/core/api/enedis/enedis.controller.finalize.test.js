const request = require('supertest');
const { expect } = require('chai');
const configTest = require('../../../tasks/config');

describe('POST /enedis/finalize', () => {
  it('should save refresh token in DB and return list of usage_points_id', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        code: 'someAuthCode',
        usage_points_id: ['16401220101758', '16401220101710', '16401220101720'],
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({
      usage_points_id: ['16401220101758', '16401220101710', '16401220101720'],
    });
  });
});
