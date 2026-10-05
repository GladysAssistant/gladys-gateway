const { expect } = require('chai');
const nock = require('nock');
const tracer = require('tracer');
const AnalyticsService = require('../../../core/service/analytics');

const logger = tracer.console({ level: 'error' });
const ANALYTICS_URL = 'https://analytics.test.gladysassistant.com/metrics';

describe('AnalyticsService', () => {
  afterEach(() => {
    delete process.env.ANALYTICS_URL;
    delete process.env.ANALYTICS_API_TOKEN;
  });

  it('should send nothing when analytics are not configured', async () => {
    const scope = nock('https://analytics.test.gladysassistant.com').post('/metrics').reply(200);
    const analyticsService = AnalyticsService(logger);

    for (let i = 0; i < 20; i += 1) {
      analyticsService.sendMessageSizeMetric('message-to-user', { data: 'test' }, 'user-id');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(scope.isDone()).to.equal(false);
    // the other tests rely on the global interceptors (Stripe...): only remove this one
    scope.interceptors.forEach((interceptor) => nock.removeInterceptor(interceptor));
  });

  it('should send the size in bytes of the messages when analytics are configured', async () => {
    process.env.ANALYTICS_URL = ANALYTICS_URL;
    process.env.ANALYTICS_API_TOKEN = 'token';
    let rows;
    const scope = nock('https://analytics.test.gladysassistant.com')
      .post('/metrics', (body) => {
        rows = body;
        return true;
      })
      .reply(200);
    const analyticsService = AnalyticsService(logger);

    // a full batch is flushed at once
    for (let i = 0; i < 20; i += 1) {
      analyticsService.sendMessageSizeMetric('message-to-user', { data: 'é' }, 'a139e4a6-ec6c');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(scope.isDone()).to.equal(true);
    expect(rows).to.have.lengthOf(20);
    expect(rows[0]).to.deep.equal({
      user_id: 'a139e4a6-ec6c',
      short_user_id: 'a139e4',
      type: 'message-to-user',
      // {"data":"é"} is 12 characters, 13 bytes
      request_size: 13,
    });
  });

  it('should not throw on a message too deeply nested to be measured', () => {
    process.env.ANALYTICS_URL = ANALYTICS_URL;
    process.env.ANALYTICS_API_TOKEN = 'token';
    const analyticsService = AnalyticsService(logger);
    const depth = 200000;
    const nested = JSON.parse(`${'['.repeat(depth)}${']'.repeat(depth)}`);

    expect(() => analyticsService.sendMessageSizeMetric('message-to-user', nested, 'user-id')).to.not.throw();
  });
});
