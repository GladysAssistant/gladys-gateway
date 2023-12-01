const request = require('supertest');
const nock = require('nock');
const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const { RateLimiterRedis } = require('rate-limiter-flexible');

const configTest = require('../../../tasks/config');

const voiceFile = fs.readFileSync(path.join(__dirname, './voice.mp3'));

describe('TTS API', () => {
  before(() => {
    process.env.TEXT_TO_SPEECH_URL = 'https://test-tts.com';
    process.env.TEXT_TO_SPEECH_API_KEY = 'my-token';
    process.env.GLADYS_PLUS_BACKEND_URL = 'http://test-api.com';
  });
  it('should get token + get mp3', async () => {
    nock(process.env.TEXT_TO_SPEECH_URL, {
      encodedQueryParams: true,
      reqheaders: {
        authorization: 'Bearer my-token',
      },
    })
      .post('/', { text: 'bonjour' })
      .reply(200, voiceFile, {
        'content-type': 'audio/mpeg',
        'content-length': 36362,
      });
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      {
        status: 'active',
      },
    );
    const response = await request(TEST_BACKEND_APP)
      .post('/tts/token')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({ text: 'bonjour' })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.have.property('token');
    expect(response.body).to.have.property('url', `http://test-api.com/tts/${response.body.token}/generate.mp3`);
    const responseMp3File = await request(TEST_BACKEND_APP)
      .get(`/tts/${response.body.token}/generate.mp3`)
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send()
      .expect('Content-Type', 'audio/mpeg')
      .expect(200);
    expect(responseMp3File.text).to.deep.equal(voiceFile.toString());
  });
  it('should return 401', async () => {
    const response = await request(TEST_BACKEND_APP)
      .get(`/tts/toto/generate.mp3`)
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send()
      .expect('Content-Type', /json/)
      .expect(401);
    expect(response.body).to.deep.equal({
      error_code: 'UNAUTHORIZED',
      status: 401,
    });
  });
  it('should return 429, too many requests', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      {
        status: 'active',
      },
    );
    const limiter = new RateLimiterRedis({
      storeClient: TEST_LEGACY_REDIS_CLIENT,
      keyPrefix: 'rate_limit:tts_api',
      points: 100, // max request per month
      duration: 30 * 24 * 60 * 60, // 30 days
    });
    await limiter.consume('b2d23f66-487d-493f-8acb-9c8adb400def', 100);
    const response = await request(TEST_BACKEND_APP)
      .post('/tts/token')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send()
      .expect('Content-Type', /json/)
      .expect(429);
    expect(response.body).to.deep.equal({
      status: 429,
      error_code: 'TOO_MANY_REQUESTS',
      error_message: 'Too many requests this month.',
    });
  });
});
