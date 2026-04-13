const request = require('supertest');
const nock = require('nock');
const { expect } = require('chai');
const { RateLimiterRedis } = require('rate-limiter-flexible');

const configTest = require('../../../tasks/config');

describe('POST /openai/ask', () => {
  before(() => {
    process.env.OPEN_AI_ASK_API_URL = 'https://test-open-ai.com';
    process.env.OPEN_AI_ASK_API_KEY = 'my-token';
  });
  it('should send question to AI', async () => {
    nock(process.env.OPEN_AI_ASK_API_URL, { encodedQueryParams: true })
      .post('/', (body) => true)
      .reply(200, {
        type: 'TURN_ON',
        answer: "J'allume la lumière de la cuisine.",
        room: 'cuisine',
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
      .post('/openai/ask')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        question: 'Allume la lumière de la cuisine',
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({
      type: 'TURN_ON',
      answer: "J'allume la lumière de la cuisine.",
      room: 'cuisine',
    });
  });
  it('should send question to AI when trialing', async () => {
    nock(process.env.OPEN_AI_ASK_API_URL, { encodedQueryParams: true })
      .post('/', (body) => true)
      .reply(200, {
        type: 'TURN_ON',
        answer: "J'allume la lumière de la cuisine.",
        room: 'cuisine',
      });
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      {
        status: 'trialing',
      },
    );
    const response = await request(TEST_BACKEND_APP)
      .post('/openai/ask')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        question: 'Allume la lumière de la cuisine',
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({
      type: 'TURN_ON',
      answer: "J'allume la lumière de la cuisine.",
      room: 'cuisine',
    });
  });
  it('should return 403, forbidden, client is not paying', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      {
        status: 'past_due',
      },
    );
    await request(TEST_BACKEND_APP)
      .post('/openai/ask')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        question: 'Allume la lumière de la cuisine',
      })
      .expect('Content-Type', /json/)
      .expect(403);
  });
  it('should return 429, too many text requests', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      {
        status: 'active',
      },
    );
    const textLimiter = new RateLimiterRedis({
      storeClient: TEST_LEGACY_REDIS_CLIENT,
      keyPrefix: 'rate_limit:open_ai:text',
      points: 100, // max request per month
      duration: 30 * 24 * 60 * 60, // 30 days
    });
    await textLimiter.consume('b2d23f66-487d-493f-8acb-9c8adb400def', 100);
    const response = await request(TEST_BACKEND_APP)
      .post('/openai/ask')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        question: 'Allume la lumière de la cuisine',
      })
      .expect('Content-Type', /json/)
      .expect(429);
    expect(response.body).to.deep.equal({
      status: 429,
      error_code: 'TOO_MANY_REQUESTS',
      error_message: 'Too many text requests this month.',
    });
  });
  it('should return 429, too many image requests', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      {
        status: 'active',
      },
    );
    const imageLimiter = new RateLimiterRedis({
      storeClient: TEST_LEGACY_REDIS_CLIENT,
      keyPrefix: 'rate_limit:open_ai:image',
      points: 100, // max request per month
      duration: 30 * 24 * 60 * 60, // 30 days
    });
    await imageLimiter.consume('b2d23f66-487d-493f-8acb-9c8adb400def', 100);
    const response = await request(TEST_BACKEND_APP)
      .post('/openai/ask')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        question: 'Décris cette image',
        image: 'base64encodedimage',
      })
      .expect('Content-Type', /json/)
      .expect(429);
    expect(response.body).to.deep.equal({
      status: 429,
      error_code: 'TOO_MANY_REQUESTS',
      error_message: 'Too many image requests this month.',
    });
  });
});
