const { expect } = require('chai');
const nock = require('nock');
const tracer = require('tracer');
const EmailList = require('../../../core/service/email-list');
const { setupPersistentNocks } = require('../../tasks/nock');

const silentLogger = tracer.colorConsole({ level: 'error' });
const TEST_API_HOST = 'https://email-list.test.example.com';
const TEST_API_TOKEN = 'test-email-list-token';
const SUBSCRIBE_PATH = '/api/v1/lists/gladys-plus-trial/subscribe';
const UNSUBSCRIBE_PATH = '/api/v1/lists/gladys-plus-trial/unsubscribe';

describe('email-list service', () => {
  let originalUrl;
  let originalToken;

  beforeEach(() => {
    originalUrl = process.env.EMAIL_LIST_API_URL;
    originalToken = process.env.EMAIL_LIST_API_TOKEN;
    process.env.EMAIL_LIST_API_URL = TEST_API_HOST;
    process.env.EMAIL_LIST_API_TOKEN = TEST_API_TOKEN;
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.EMAIL_LIST_API_URL;
    } else {
      process.env.EMAIL_LIST_API_URL = originalUrl;
    }
    if (originalToken === undefined) {
      delete process.env.EMAIL_LIST_API_TOKEN;
    } else {
      process.env.EMAIL_LIST_API_TOKEN = originalToken;
    }
    // Drops the interceptors left unused on purpose, then restores the global ones (test/tasks/nock.js).
    nock.cleanAll();
    setupPersistentNocks();
  });

  describe('subscribe', () => {
    it('should POST the expected body to the list subscribe route with the API token', async () => {
      let receivedBody = null;
      const scope = nock(TEST_API_HOST, { reqheaders: { authorization: `Bearer ${TEST_API_TOKEN}` } })
        .post(SUBSCRIBE_PATH, (body) => {
          receivedBody = body;
          return true;
        })
        .reply(200, { status: 'active' });

      const service = EmailList(silentLogger);
      await service.subscribe({
        email: 'jane@example.com',
        firstname: 'Jane',
        list: 'gladysPlusTrial',
        language: 'fr',
      });

      expect(scope.isDone()).to.equal(true);
      expect(receivedBody).to.deep.equal({
        email: 'jane@example.com',
        firstname: 'Jane',
        language: 'fr',
      });
    });

    it('should accept an API URL with a trailing slash', async () => {
      process.env.EMAIL_LIST_API_URL = `${TEST_API_HOST}/`;
      const scope = nock(TEST_API_HOST).post(SUBSCRIBE_PATH).reply(200, { status: 'active' });

      const service = EmailList(silentLogger);
      await service.subscribe({
        email: 'jane@example.com',
        firstname: 'Jane',
        list: 'gladysPlusTrial',
        language: 'fr',
      });

      expect(scope.isDone()).to.equal(true);
    });

    it('should default firstname to an empty string when missing', async () => {
      let receivedBody = null;
      nock(TEST_API_HOST)
        .post(SUBSCRIBE_PATH, (body) => {
          receivedBody = body;
          return true;
        })
        .reply(200, { status: 'active' });

      const service = EmailList(silentLogger);
      await service.subscribe({
        email: 'jane@example.com',
        firstname: undefined,
        list: 'gladysPlusTrial',
        language: 'en',
      });

      expect(receivedBody).to.have.property('firstname', '');
    });

    it('should not call the API if the EMAIL_LIST_API_URL env var is unset', async () => {
      delete process.env.EMAIL_LIST_API_URL;
      const scope = nock(TEST_API_HOST).post(SUBSCRIBE_PATH).reply(200, { status: 'active' });
      const service = EmailList(silentLogger);
      await service.subscribe({
        email: 'jane@example.com',
        firstname: 'Jane',
        list: 'gladysPlusTrial',
        language: 'en',
      });
      expect(scope.isDone()).to.equal(false);
    });

    it('should not call the API if the EMAIL_LIST_API_TOKEN env var is unset', async () => {
      delete process.env.EMAIL_LIST_API_TOKEN;
      const scope = nock(TEST_API_HOST).post(SUBSCRIBE_PATH).reply(200, { status: 'active' });
      const service = EmailList(silentLogger);
      await service.subscribe({
        email: 'jane@example.com',
        firstname: 'Jane',
        list: 'gladysPlusTrial',
        language: 'en',
      });
      expect(scope.isDone()).to.equal(false);
    });

    it('should not call the API for an unknown list', async () => {
      const scope = nock(TEST_API_HOST).post(/.*/).reply(200, {});
      const service = EmailList(silentLogger);
      await service.subscribe({ email: 'jane@example.com', firstname: 'Jane', list: 'unknownList', language: 'en' });
      expect(scope.isDone()).to.equal(false);
    });

    it('should swallow upstream errors so that webhooks never fail', async () => {
      nock(TEST_API_HOST).post(SUBSCRIBE_PATH).reply(500, { error: 'boom' });
      const service = EmailList(silentLogger);
      // Should not throw.
      await service.subscribe({
        email: 'jane@example.com',
        firstname: 'Jane',
        list: 'gladysPlusTrial',
        language: 'en',
      });
    });
  });

  describe('unsubscribe', () => {
    it('should POST the email to the list unsubscribe route with the API token', async () => {
      let receivedBody = null;
      const scope = nock(TEST_API_HOST, { reqheaders: { authorization: `Bearer ${TEST_API_TOKEN}` } })
        .post(UNSUBSCRIBE_PATH, (body) => {
          receivedBody = body;
          return true;
        })
        .reply(200, { status: 'unsubscribed' });

      const service = EmailList(silentLogger);
      await service.unsubscribe({
        email: 'jane@example.com',
        list: 'gladysPlusTrial',
        language: 'fr',
      });

      expect(scope.isDone()).to.equal(true);
      expect(receivedBody).to.deep.equal({
        email: 'jane@example.com',
      });
    });

    it('should not call the API if the EMAIL_LIST_API_URL env var is unset', async () => {
      delete process.env.EMAIL_LIST_API_URL;
      const scope = nock(TEST_API_HOST).post(UNSUBSCRIBE_PATH).reply(200, { status: 'unsubscribed' });
      const service = EmailList(silentLogger);
      await service.unsubscribe({
        email: 'jane@example.com',
        list: 'gladysPlusTrial',
        language: 'en',
      });
      expect(scope.isDone()).to.equal(false);
    });

    it('should swallow upstream errors so that webhooks never fail', async () => {
      nock(TEST_API_HOST).post(UNSUBSCRIBE_PATH).reply(401, { error: 'unauthorized' });
      const service = EmailList(silentLogger);
      await service.unsubscribe({
        email: 'jane@example.com',
        list: 'gladysPlusTrial',
        language: 'en',
      });
    });
  });
});
