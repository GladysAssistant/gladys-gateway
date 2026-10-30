const request = require('supertest');
const { expect } = require('chai');
const configTest = require('../../../tasks/config');
const Jwt = require('../../../../core/service/jwt');

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

  it('should limit the refreshes of an account, whatever the user asking for them', async () => {
    const refreshAllData = (accessToken) =>
      request(TEST_BACKEND_APP)
        .post('/enedis/refresh_all')
        .set('Accept', 'application/json')
        .set('Authorization', accessToken)
        .expect('Content-Type', /json/);

    await refreshAllData(configTest.jwtAccessTokenDashboard).expect(200);
    await refreshAllData(configTest.jwtAccessTokenDashboard).expect(200);
    await refreshAllData(configTest.jwtAccessTokenDashboard).expect(200);
    await refreshAllData(configTest.jwtAccessTokenDashboard).expect(429);

    // another user of the same account refreshes the same usage points
    const otherUserAccessToken = Jwt().generateAccessToken({ id: 'bdb1a902-a65e-46f9-8c2a-5c09840e2e10' }, [
      'dashboard:read',
      'dashboard:write',
    ]);
    await refreshAllData(otherUserAccessToken).expect(429);
  });

  it('should not let a user removed from the account spend its refreshes', async () => {
    await TEST_DATABASE_INSTANCE.t_user.update('a139e4a6-ec6c-442d-9730-0499155d38d4', { is_deleted: true });
    const refreshAllData = (accessToken) =>
      request(TEST_BACKEND_APP)
        .post('/enedis/refresh_all')
        .set('Accept', 'application/json')
        .set('Authorization', accessToken)
        .expect('Content-Type', /json/);

    // access token issued before the removal
    await refreshAllData(configTest.jwtAccessTokenDashboard).expect(404);
    await refreshAllData(configTest.jwtAccessTokenDashboard).expect(404);
    await refreshAllData(configTest.jwtAccessTokenDashboard).expect(404);

    // the refreshes of the account are left to its members
    const otherUserAccessToken = Jwt().generateAccessToken({ id: 'bdb1a902-a65e-46f9-8c2a-5c09840e2e10' }, [
      'dashboard:read',
      'dashboard:write',
    ]);
    await refreshAllData(otherUserAccessToken).expect(200);
  });
});
