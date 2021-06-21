const request = require('supertest');
const { expect } = require('chai');
const qs = require('querystring');
const configTest = require('../../../tasks/config');

describe('POST /google/authorize', () => {
  it('should return authorization code', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/google/authorize')
      .send({
        redirect_uri: 'https://oauth-redirect-sandbox.googleusercontent.com/toto',
        state: 'toto',
        client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.have.property('redirectUrl');
    expect(response.body.redirectUrl).to.contain('?state=toto');
    expect(response.body.redirectUrl).to.contain('&code=');
  });
  it('should return bad request', async () => {
    await request(TEST_BACKEND_APP)
      .post('/google/authorize')
      .send({
        state: 'toto',
        client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(400);
  });
  it('should return bad request', async () => {
    await request(TEST_BACKEND_APP)
      .post('/google/authorize')
      .send({
        redirect_uri: 'https://oauth-redirect-sandbox.googleusercontent.com/toto',
        state: 'toto',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(400);
  });
  it('should return bad request', async () => {
    await request(TEST_BACKEND_APP)
      .post('/google/authorize')
      .send({
        redirect_uri: 'https://toto.com',
        state: 'toto',
        client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(400);
  });
});

describe('POST /v1/api/google/token', () => {
  it('should return access token & refresh token', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/google/authorize')
      .send({
        redirect_uri: 'https://oauth-redirect-sandbox.googleusercontent.com/toto',
        state: 'toto',
        client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    const myUrl = new URL(response.body.redirectUrl);
    const queryStringToSend = qs.encode({
      client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_HOME_OAUTH_CLIENT_SECRET,
      state: 'toto',
      code: myUrl.searchParams.get('code'),
      grant_type: 'authorization_code',
    });
    const tokenResponse = await request(TEST_BACKEND_APP)
      .post('/v1/api/google/token')
      .send(queryStringToSend)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(200);

    expect(tokenResponse.body).to.have.property('access_token');
    expect(tokenResponse.body).to.have.property('refresh_token');
    expect(tokenResponse.body).to.have.property('expires_in');

    const queryStringRefreshTokenToSend = qs.encode({
      client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_HOME_OAUTH_CLIENT_SECRET,
      refresh_token: tokenResponse.body.refresh_token,
      grant_type: 'refresh_token',
    });
    const refreshTokenResponse = await request(TEST_BACKEND_APP)
      .post('/v1/api/google/token')
      .send(queryStringRefreshTokenToSend)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(200);
    expect(refreshTokenResponse.body).to.have.property('access_token');
    expect(refreshTokenResponse.body).not.to.have.property('refresh_token');
    expect(refreshTokenResponse.body).to.have.property('expires_in');
  });
  it('should return 400 bad request', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/google/authorize')
      .send({
        redirect_uri: 'https://oauth-redirect-sandbox.googleusercontent.com/toto',
        state: 'toto',
        client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    const myUrl = new URL(response.body.redirectUrl);
    const queryStringToSend = qs.encode({
      client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
      client_secret: 'WRONG CLIENT SECRET',
      state: 'toto',
      code: myUrl.searchParams.get('code'),
      grant_type: 'authorization_code',
    });
    await request(TEST_BACKEND_APP)
      .post('/v1/api/google/token')
      .send(queryStringToSend)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(400);
  });
  it('should return 400 bad request', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/google/authorize')
      .send({
        redirect_uri: 'https://oauth-redirect-sandbox.googleusercontent.com/toto',
        state: 'toto',
        client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    const myUrl = new URL(response.body.redirectUrl);
    const queryStringToSend = qs.encode({
      client_id: 'WRONG CLIENT SECRET',
      client_secret: process.env.GOOGLE_HOME_OAUTH_CLIENT_SECRET,
      state: 'toto',
      code: myUrl.searchParams.get('code'),
      grant_type: 'authorization_code',
    });
    await request(TEST_BACKEND_APP)
      .post('/v1/api/google/token')
      .send(queryStringToSend)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(400);
  });
  it('should return 400 bad request', async () => {
    await request(TEST_BACKEND_APP)
      .post('/google/authorize')
      .send({
        redirect_uri: 'https://oauth-redirect-sandbox.googleusercontent.com/toto',
        state: 'toto',
        client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    const queryStringToSend = qs.encode({
      client_id: process.env.GOOGLE_HOME_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_HOME_OAUTH_CLIENT_SECRET,
      code: 'WRONG CODE',
      grant_type: 'authorization_code',
    });
    await request(TEST_BACKEND_APP)
      .post('/v1/api/google/token')
      .send(queryStringToSend)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(400);
  });
});
