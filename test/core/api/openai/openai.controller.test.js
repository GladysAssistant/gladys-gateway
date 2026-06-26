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

  it('should return 429, too many image requests with OpenAI-style messages', async () => {
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
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Décris cette image',
              },
              {
                type: 'image_url',
                image_url: {
                  url: 'https://example.com/image.jpg',
                },
              },
            ],
          },
        ],
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

describe('GET /openai/quota', () => {
  const ACCOUNT_ID = 'b2d23f66-487d-493f-8acb-9c8adb400def';

  beforeEach(async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: ACCOUNT_ID,
      },
      {
        status: 'active',
      },
    );
  });

  it('should return full quota when no requests have been made', async () => {
    const response = await request(TEST_BACKEND_APP)
      .get('/openai/quota')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).to.deep.equal({
      text: {
        remaining: 100,
        max: 100,
        reset_in_seconds: 0,
      },
      image: {
        remaining: 100,
        max: 100,
        reset_in_seconds: 0,
      },
    });
  });

  it('should return remaining text quota after consumption', async () => {
    const textLimiter = new RateLimiterRedis({
      storeClient: TEST_LEGACY_REDIS_CLIENT,
      keyPrefix: 'rate_limit:open_ai:text',
      points: 100,
      duration: 30 * 24 * 60 * 60,
    });
    await textLimiter.consume(ACCOUNT_ID, 25);

    const response = await request(TEST_BACKEND_APP)
      .get('/openai/quota')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.text).to.deep.equal({
      remaining: 75,
      max: 100,
      reset_in_seconds: response.body.text.reset_in_seconds,
    });
    expect(response.body.text.reset_in_seconds).to.be.above(0);
    expect(response.body.image).to.deep.equal({
      remaining: 100,
      max: 100,
      reset_in_seconds: 0,
    });
  });

  it('should return remaining image quota after consumption', async () => {
    const imageLimiter = new RateLimiterRedis({
      storeClient: TEST_LEGACY_REDIS_CLIENT,
      keyPrefix: 'rate_limit:open_ai:image',
      points: 100,
      duration: 30 * 24 * 60 * 60,
    });
    await imageLimiter.consume(ACCOUNT_ID, 40);

    const response = await request(TEST_BACKEND_APP)
      .get('/openai/quota')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.image).to.deep.equal({
      remaining: 60,
      max: 100,
      reset_in_seconds: response.body.image.reset_in_seconds,
    });
    expect(response.body.image.reset_in_seconds).to.be.above(0);
    expect(response.body.text).to.deep.equal({
      remaining: 100,
      max: 100,
      reset_in_seconds: 0,
    });
  });

  it('should return 401 without authorization', async () => {
    const response = await request(TEST_BACKEND_APP)
      .get('/openai/quota')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(401);

    expect(response.body).to.deep.equal({
      error_code: 'UNAUTHORIZED',
      status: 401,
    });
  });
});
