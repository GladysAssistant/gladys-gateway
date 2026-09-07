const request = require('supertest');
const { expect } = require('chai');
const configTest = require('../../../tasks/config');

const SUPER_ADMIN_USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';

describe('Admin API authentication', () => {
  let previousSuperAdminUserId;

  before(() => {
    previousSuperAdminUserId = process.env.SUPER_ADMIN_USER_ID;
  });

  beforeEach(() => {
    process.env.SUPER_ADMIN_USER_ID = SUPER_ADMIN_USER_ID;
  });

  after(() => {
    // other test files expect the fixture user not to be the super admin
    if (previousSuperAdminUserId === undefined) {
      delete process.env.SUPER_ADMIN_USER_ID;
    } else {
      process.env.SUPER_ADMIN_USER_ID = previousSuperAdminUserId;
    }
  });

  it('should return 401 without any credential', async () => {
    const response = await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(401);
    expect(response.body).to.have.property('error_code', 'UNAUTHORIZED');
  });

  it('should return 401 with a wrong api key', async () => {
    await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('Accept', 'application/json')
      .set('X-Admin-Api-Key', 'wrong-key')
      .expect(401);
  });

  it('should return 401 with a wrong api key of the right length', async () => {
    await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('Accept', 'application/json')
      .set('X-Admin-Api-Key', 'x'.repeat(process.env.ADMIN_API_AUTHORIZATION_TOKEN.length))
      .expect(401);
  });

  it('should return 200 with the admin api key', async () => {
    await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('Accept', 'application/json')
      .set('X-Admin-Api-Key', process.env.ADMIN_API_AUTHORIZATION_TOKEN)
      .expect('Content-Type', /json/)
      .expect(200);
  });

  it('should return 429 after too many wrong api keys', async () => {
    // 5 failed attempts are allowed per 24 hours
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(TEST_BACKEND_APP).get('/admin/api/accounts').set('X-Admin-Api-Key', 'wrong-key').expect(401);
    }
    await request(TEST_BACKEND_APP).get('/admin/api/accounts').set('X-Admin-Api-Key', 'wrong-key').expect(429);
    // even the right key is refused once the ip is rate limited
    await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('X-Admin-Api-Key', process.env.ADMIN_API_AUTHORIZATION_TOKEN)
      .expect(429);
  });

  it('should return 200 with the access token of the super admin', async () => {
    await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
  });

  it('should return 200 with the access token of the super admin (Bearer prefix)', async () => {
    await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${configTest.jwtAccessTokenDashboard}`)
      .expect(200);
  });

  it('should return 401 with the access token of a user who is not the super admin', async () => {
    process.env.SUPER_ADMIN_USER_ID = '29770e0d-26a9-444e-91a1-f175c99a5218';
    await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(401);
  });

  it('should return 401 with a valid access token when no super admin is configured', async () => {
    delete process.env.SUPER_ADMIN_USER_ID;
    await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(401);
  });

  it('should return 401 with a two factor token (wrong scope)', async () => {
    await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtTwoFactorToken)
      .expect(401);
  });

  it('should return 401 with an invalid access token', async () => {
    await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('should refuse the version api key on routes other than version creation', async () => {
    await request(TEST_BACKEND_APP)
      .get('/admin/api/accounts')
      .set('Accept', 'application/json')
      .set('X-Admin-Api-Key', process.env.GLADYS_VERSION_API_KEY)
      .expect(401);
    await request(TEST_BACKEND_APP)
      .get('/admin/api/gladys/versions')
      .set('Accept', 'application/json')
      .set('X-Admin-Api-Key', process.env.GLADYS_VERSION_API_KEY)
      .expect(401);
  });

  it('should still accept the legacy admin api routes with the raw Authorization header', async () => {
    await request(TEST_BACKEND_APP)
      .post('/admin/api/enedis/daily_refresh')
      .set('Accept', 'application/json')
      .set('Authorization', process.env.ADMIN_API_AUTHORIZATION_TOKEN)
      .expect(200);
    await request(TEST_BACKEND_APP)
      .post('/admin/api/enedis/daily_refresh')
      .set('Accept', 'application/json')
      .set('Authorization', 'wrong')
      .expect(401);
  });
});
