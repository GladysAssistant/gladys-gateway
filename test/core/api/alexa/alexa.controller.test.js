const request = require('supertest');
const { expect } = require('chai');
const nock = require('nock');
const qs = require('querystring');
const redis = require('redis');
const Promise = require('bluebird');
const configTest = require('../../../tasks/config');

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
});

Promise.promisifyAll(redis);

describe('POST /alexa/authorize', () => {
  it('should return authorization code', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/alexa/authorize')
      .send({
        redirect_uri: 'https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUV',
        state: 'toto',
        client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
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
      .post('/alexa/authorize')
      .send({
        state: 'toto',
        client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(400);
  });
  it('should return bad request', async () => {
    await request(TEST_BACKEND_APP)
      .post('/alexa/authorize')
      .send({
        redirect_uri: 'https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUV',
        state: 'toto',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(400);
  });
  it('should return bad request', async () => {
    await request(TEST_BACKEND_APP)
      .post('/alexa/authorize')
      .send({
        redirect_uri: 'https://toto.com',
        state: 'toto',
        client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(400);
  });
});

describe('POST /v1/api/alexa/token', () => {
  it('should return access token & refresh token', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/alexa/authorize')
      .send({
        redirect_uri: 'https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUV',
        state: 'toto',
        client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    const myUrl = new URL(response.body.redirectUrl);
    const queryStringToSend = qs.encode({
      client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      client_secret: process.env.ALEXA_OAUTH_CLIENT_SECRET,
      state: 'toto',
      code: myUrl.searchParams.get('code'),
      grant_type: 'authorization_code',
    });
    const tokenResponse = await request(TEST_BACKEND_APP)
      .post('/v1/api/alexa/token')
      .send(queryStringToSend)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(200);

    expect(tokenResponse.body).to.have.property('access_token');
    expect(tokenResponse.body).to.have.property('refresh_token');
    expect(tokenResponse.body).to.have.property('expires_in');

    const queryStringRefreshTokenToSend = qs.encode({
      client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      client_secret: process.env.ALEXA_OAUTH_CLIENT_SECRET,
      refresh_token: tokenResponse.body.refresh_token,
      grant_type: 'refresh_token',
    });
    const refreshTokenResponse = await request(TEST_BACKEND_APP)
      .post('/v1/api/alexa/token')
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
      .post('/alexa/authorize')
      .send({
        redirect_uri: 'https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUV',
        state: 'toto',
        client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    const myUrl = new URL(response.body.redirectUrl);
    const queryStringToSend = qs.encode({
      client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      client_secret: 'WRONG CLIENT SECRET',
      state: 'toto',
      code: myUrl.searchParams.get('code'),
      grant_type: 'authorization_code',
    });
    await request(TEST_BACKEND_APP)
      .post('/v1/api/alexa/token')
      .send(queryStringToSend)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(400);
  });
  it('should return 400 bad request', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/alexa/authorize')
      .send({
        redirect_uri: 'https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUV',
        state: 'toto',
        client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    const myUrl = new URL(response.body.redirectUrl);
    const queryStringToSend = qs.encode({
      client_id: 'WRONG CLIENT SECRET',
      client_secret: process.env.ALEXA_OAUTH_CLIENT_SECRET,
      state: 'toto',
      code: myUrl.searchParams.get('code'),
      grant_type: 'authorization_code',
    });
    await request(TEST_BACKEND_APP)
      .post('/v1/api/alexa/token')
      .send(queryStringToSend)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(400);
  });
  it('should return 400 bad request', async () => {
    await request(TEST_BACKEND_APP)
      .post('/alexa/authorize')
      .send({
        redirect_uri: 'https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUV',
        state: 'toto',
        client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    const queryStringToSend = qs.encode({
      client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      client_secret: process.env.ALEXA_OAUTH_CLIENT_SECRET,
      code: 'WRONG CODE',
      grant_type: 'authorization_code',
    });
    await request(TEST_BACKEND_APP)
      .post('/v1/api/alexa/token')
      .send(queryStringToSend)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(400);
  });
});

describe('POST /alexa/report_state', () => {
  beforeEach(async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/alexa/authorize')
      .send({
        redirect_uri: 'https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUV',
        state: 'toto',
        client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    const myUrl = new URL(response.body.redirectUrl);
    const queryStringToSend = qs.encode({
      client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      client_secret: process.env.ALEXA_OAUTH_CLIENT_SECRET,
      state: 'toto',
      code: myUrl.searchParams.get('code'),
      grant_type: 'authorization_code',
    });
    const tokenResult = await request(TEST_BACKEND_APP)
      .post('/v1/api/alexa/token')
      .send(queryStringToSend)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(200);
    nock('https://api.amazon.com')
      .post('/auth/o2/token', (body) => {
        const grandTypeValid = body.grant_type === 'authorization_code';
        const codeValid = body.code === 'someAuthCode';
        const clientIdValid = body.client_id === process.env.ALEXA_GRANT_CLIENT_ID;
        const clientSecretValid = body.client_secret === process.env.ALEXA_GRANT_CLIENT_SECRET;
        return grandTypeValid && codeValid && clientIdValid && clientSecretValid;
      })
      .reply(200, {
        refresh_token: 'refresh_token',
        access_token: 'access_token',
        expires_in: 100,
      });
    await request(TEST_BACKEND_APP)
      .post('/v1/api/alexa/smart_home')
      .send({
        directive: {
          header: {
            namespace: 'Alexa.Authorization',
            name: 'AcceptGrant',
            messageId: '3b7e736f-d0dc-4a00-8e39-99796016b2f4',
            payloadVersion: '3',
          },
          payload: {
            grant: {
              type: 'OAuth2.AuthorizationCode',
              code: 'someAuthCode',
            },
            grantee: {
              type: 'BearerToken',
              token: 'someAccessToken',
            },
          },
        },
      })
      .set('Accept', 'application/json')
      .set('Authorization', tokenResult.body.access_token)
      .expect('Content-Type', /json/)
      .expect(200);
  });
  it('should report a new state', async () => {
    nock('https://api.amazon.com:443', { encodedQueryParams: true })
      .post('/auth/o2/token', (body) => {
        const grandTypeValid = body.grand_type === 'refresh_token';
        const refreshTokenValid = body.refresh_token === 'refresh_token';
        const clientIdValid = body.client_id === process.env.ALEXA_OAUTH_CLIENT_ID;
        const clientSecretValid = body.client_secret === process.env.ALEXA_OAUTH_CLIENT_SECRET;
        return grandTypeValid && refreshTokenValid && clientIdValid && clientSecretValid;
      })
      .reply(200, {
        access_token: 'toto',
        expires_in: 100,
      });
    nock('https://api.eu.amazonalexa.com:443', { encodedQueryParams: true })
      .post('/v3/events', (body) => body.test_data === true)
      .reply(200, {
        status: 200,
      });
    const response = await request(TEST_BACKEND_APP)
      .post('/alexa/report_state')
      .send({
        test_data: true,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({ status: 200 });
  });
  it('should report a new state and get a 404', async () => {
    nock('https://api.amazon.com:443', { encodedQueryParams: true })
      .post('/auth/o2/token', (body) => {
        const grandTypeValid = body.grand_type === 'refresh_token';
        const refreshTokenValid = body.refresh_token === 'refresh_token';
        const clientIdValid = body.client_id === process.env.ALEXA_OAUTH_CLIENT_ID;
        const clientSecretValid = body.client_secret === process.env.ALEXA_OAUTH_CLIENT_SECRET;
        return grandTypeValid && refreshTokenValid && clientIdValid && clientSecretValid;
      })
      .reply(200, {
        access_token: 'toto',
        expires_in: 100,
      });
    nock('https://api.eu.amazonalexa.com:443', { encodedQueryParams: true })
      .post('/v3/events', (body) => body.test_data === true)
      .reply(404, {
        status: 404,
      });
    const response = await request(TEST_BACKEND_APP)
      .post('/alexa/report_state')
      .send({
        test_data: true,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({ status: 200 });
  });
  it('should report a new state and revoke token', async () => {
    // flush redis so no access token is accessible
    await redisClient.connect();
    await redisClient.flushAll();
    nock('https://api.amazon.com:443', { encodedQueryParams: true })
      .post('/auth/o2/token', (body) => true)
      .reply(400, {
        code: 'BAD_REQUEST',
      });
    const response = await request(TEST_BACKEND_APP)
      .post('/alexa/report_state')
      .send({
        test_data: true,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({ status: 200 });
    const deviceModified = await TEST_DATABASE_INSTANCE.t_device.findOne({
      user_id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
      client_id: 'alexa',
    });
    expect(deviceModified).to.have.property('revoked', true);
  });
});

describe('POST /v1/api/alexa/smart_home', () => {
  let accessToken;
  beforeEach(async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/alexa/authorize')
      .send({
        redirect_uri: 'https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUV',
        state: 'toto',
        client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    const myUrl = new URL(response.body.redirectUrl);
    const queryStringToSend = qs.encode({
      client_id: process.env.ALEXA_OAUTH_CLIENT_ID,
      client_secret: process.env.ALEXA_OAUTH_CLIENT_SECRET,
      state: 'toto',
      code: myUrl.searchParams.get('code'),
      grant_type: 'authorization_code',
    });
    const tokenResult = await request(TEST_BACKEND_APP)
      .post('/v1/api/alexa/token')
      .send(queryStringToSend)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(200);
    accessToken = tokenResult.body.access_token;
  });
  it('should send smart home request', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/v1/api/alexa/smart_home')
      .send({
        directive: {
          header: {
            namespace: 'Alexa.PowerController',
            name: 'TurnOn',
            payloadVersion: '3',
            messageId: 'c43c5ef1-b456-4736-ba6b-4643a98a7e27',
            correlationToken:
              'AAAAAAAAAQBe8ATzt+PzWVqbUXXQAv6JFAIAAAAAAADNYsvnxph02bkNS9vIkVRS1S/HQ30Nab1ai4U8WdBDVhSBKEkvJkzXTZFidmkW/eI78kPC8zSg4HTO0I1BfpLZ3qKVHkvLija4pKuhadAHKg96ccMDKR7krNc3AZ5RaDrg1QTPGbEfKXbUoPMNNo9HyRJzoEaqphBRI2/aFLmHaHnENYM8Ou3y7CzFj41xQ3VBjKQdyb4cxD2MJrAln2X5t0vuMcxkgMJ0ZTt9L9N3aQKFx9Xi3RI91cR4cDajUxGGx1RzYa2t6oroos5tjN3IutEntO7V0iKO/9CMnerWuFbihll7EeiDxY33h2KcY4MCIg2zQKaBRnyHwin+R/e9A7Ozv3CR/Qvxj5CxmL9nHHFjZMRXsauNNfG5vzzo03H5WutpXjC/UwfPviGk0dG+FBH7AqQ4TH1RojoLS/a1mcpsxSORo/dezT3d9zxlD/8lcsMcWZao5mxEkQybkrOBxXVhgAJyyH+5X/RJjUWVjVBxR4ODIRie1RKuTcmla7VwqM8JocAUy9lWsCMXjW5KhNBnVca/xU8I/XfhaVD+LV+pqDDvgDmq/KVYyp8bbFKVdSQ9mFrVMpgt97lnMDd2oNASDET10grmQdwbn/FivkK2tnveVlaU7/BpnC+JpGBqHT0DSJucu0es0SLlEd875QAdGPJ4Eg+OD4t8z4NqXyyH2iqVhq+AwQDFjY6UpPaWkykN',
          },
          endpoint: {
            scope: {
              type: 'BearerToken',
              token: 'someAccessToken',
            },
            endpointId: 'device-1',
            cookie: {},
          },
          payload: {},
        },
      })
      .set('Accept', 'application/json')
      .set('Authorization', accessToken)
      .expect('Content-Type', /json/)
      .expect(404);
    expect(response.body).to.deep.equal({ error_code: 'NOT_FOUND', error_message: 'NO_INSTANCE_FOUND', status: 404 });
  });
});
