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
  it('should save AI usage in database', async () => {
    nock(process.env.OPEN_AI_ASK_API_URL, { encodedQueryParams: true })
      .post('/', (body) => true)
      .reply(200, {
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'VUX6HkFsJ',
                  type: 'function',
                  function: {
                    name: 'scene_create',
                    arguments: '{}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        created: 1783342697,
        id: 'chatcmpl-2e652b93-2da4-4a4a-a0e7-92adad47843f',
        model: 'mistral-small-3.2-24b-instruct-2506',
        object: 'chat.completion',
        usage: {
          prompt_tokens: 7966,
          total_tokens: 8041,
          completion_tokens: 75,
        },
      });
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      {
        status: 'active',
      },
    );
    await request(TEST_BACKEND_APP)
      .post('/openai/ask')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        question: 'Crée une scène qui vérifie le niveau de CO2 au lever du soleil',
        purpose: 'chat',
        categories: ['scenes', 'device_query'],
      })
      .expect('Content-Type', /json/)
      .expect(200);
    const aiUsages = await TEST_DATABASE_INSTANCE.t_ai_usage.find({});
    expect(aiUsages).to.have.lengthOf(1);
    const aiUsage = aiUsages[0];
    expect(aiUsage).to.include({
      account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      instance_id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      request_type: 'text',
      purpose: 'chat',
      model: 'mistral-small-3.2-24b-instruct-2506',
      prompt_tokens: 7966,
      completion_tokens: 75,
      total_tokens: 8041,
      finish_reason: 'tool_calls',
      api_response_id: 'chatcmpl-2e652b93-2da4-4a4a-a0e7-92adad47843f',
    });
    expect(aiUsage.categories).to.deep.equal(['scenes', 'device_query']);
    expect(aiUsage.response_time_ms).to.be.a('number');
    expect(aiUsage.response_time_ms).to.be.at.least(0);
  });
  it('should save AI usage without token data when API response has no usage field', async () => {
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
    await request(TEST_BACKEND_APP)
      .post('/openai/ask')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        question: 'Allume la lumière de la cuisine',
      })
      .expect('Content-Type', /json/)
      .expect(200);
    const aiUsages = await TEST_DATABASE_INSTANCE.t_ai_usage.find({});
    expect(aiUsages).to.have.lengthOf(1);
    expect(aiUsages[0]).to.include({
      account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      instance_id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      request_type: 'text',
      purpose: null,
      categories: null,
      model: null,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      finish_reason: null,
      api_response_id: null,
    });
  });
  describe('when the AI service fails', () => {
    beforeEach(async () => {
      await TEST_DATABASE_INSTANCE.t_account.update(
        {
          id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
        },
        {
          status: 'active',
        },
      );
    });
    afterEach(() => {
      delete process.env.OPEN_AI_ASK_TIMEOUT_MS;
    });

    async function ask() {
      return request(TEST_BACKEND_APP)
        .post('/openai/ask')
        .set('Accept', 'application/json')
        .set('Authorization', configTest.jwtAccessTokenInstance)
        .send({
          question: 'Allume la lumière de la cuisine',
        })
        .expect('Content-Type', /json/);
    }

    it('should return 504 when the AI service answers 504', async () => {
      nock(process.env.OPEN_AI_ASK_API_URL, { encodedQueryParams: true })
        .post('/', (body) => true)
        .reply(504, 'Scaleway request timed out');
      const response = await ask();
      expect(response.status).to.equal(504);
      expect(response.body).to.deep.equal({
        status: 504,
        error_code: 'GATEWAY_TIMEOUT',
        error_message: 'AI service did not answer in time',
      });
      const aiUsages = await TEST_DATABASE_INSTANCE.t_ai_usage.find({});
      expect(aiUsages).to.have.lengthOf(0);
    });

    it('should return 504 when the AI service does not answer before the gateway timeout', async () => {
      process.env.OPEN_AI_ASK_TIMEOUT_MS = '50';
      nock(process.env.OPEN_AI_ASK_API_URL, { encodedQueryParams: true })
        .post('/', (body) => true)
        .delay(500)
        .reply(200, { type: 'TURN_ON' });
      const response = await ask();
      expect(response.status).to.equal(504);
      expect(response.body.error_code).to.equal('GATEWAY_TIMEOUT');
      nock.cleanAll();
    });

    it('should return 502 when the AI service answers 500', async () => {
      nock(process.env.OPEN_AI_ASK_API_URL, { encodedQueryParams: true })
        .post('/', (body) => true)
        .reply(500, { error: 'Internal Server Error' });
      const response = await ask();
      expect(response.status).to.equal(502);
      expect(response.body).to.deep.equal({
        status: 502,
        error_code: 'BAD_GATEWAY',
        error_message: 'AI service returned an error',
      });
    });

    it('should return 502 when the AI service rejects the request (400)', async () => {
      nock(process.env.OPEN_AI_ASK_API_URL, { encodedQueryParams: true })
        .post('/', (body) => true)
        .reply(400, { error: { message: 'invalid request' } });
      const response = await ask();
      expect(response.status).to.equal(502);
      expect(response.body.error_code).to.equal('BAD_GATEWAY');
    });

    it('should return 502 when the AI service is unreachable', async () => {
      nock(process.env.OPEN_AI_ASK_API_URL, { encodedQueryParams: true })
        .post('/', (body) => true)
        .replyWithError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' });
      const response = await ask();
      expect(response.status).to.equal(502);
      expect(response.body).to.deep.equal({
        status: 502,
        error_code: 'BAD_GATEWAY',
        error_message: 'AI service is unreachable',
      });
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
