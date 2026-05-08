const { expect } = require('chai');
const nock = require('nock');
const tracer = require('tracer');
const EmailList = require('../../../core/service/email-list');

const silentLogger = tracer.colorConsole({ level: 'error' });
const TEST_API_HOST = 'https://email-list.test.example.com';
const TEST_API_PATH = '/subscribers';
const TEST_API_URL = `${TEST_API_HOST}${TEST_API_PATH}`;

describe('email-list service', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.EMAIL_LIST_API_URL;
    process.env.EMAIL_LIST_API_URL = TEST_API_URL;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EMAIL_LIST_API_URL;
    } else {
      process.env.EMAIL_LIST_API_URL = originalEnv;
    }
  });

  describe('subscribe', () => {
    it('should POST the expected body to the configured URL', async () => {
      let receivedBody = null;
      const scope = nock(TEST_API_HOST)
        .post(TEST_API_PATH, (body) => {
          receivedBody = body;
          return true;
        })
        .reply(200, { ok: true });

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
        list: 'gladysPlusTrial',
        language: 'fr',
      });
    });

    it('should default firstname to an empty string when missing', async () => {
      let receivedBody = null;
      nock(TEST_API_HOST)
        .post(TEST_API_PATH, (body) => {
          receivedBody = body;
          return true;
        })
        .reply(200, { ok: true });

      const service = EmailList(silentLogger);
      await service.subscribe({
        email: 'jane@example.com',
        firstname: undefined,
        list: 'gladysPlusTrial',
        language: 'en',
      });

      expect(receivedBody).to.have.property('firstname', '');
    });

    it('should not throw if the EMAIL_LIST_API_URL env var is unset', async () => {
      delete process.env.EMAIL_LIST_API_URL;
      const service = EmailList(silentLogger);
      // Should resolve silently without making any HTTP call.
      await service.subscribe({
        email: 'jane@example.com',
        firstname: 'Jane',
        list: 'gladysPlusTrial',
        language: 'en',
      });
    });

    it('should swallow upstream errors so that webhooks never fail', async () => {
      nock(TEST_API_HOST).post(TEST_API_PATH).reply(500, { error: 'boom' });
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
    it('should POST the expected body with action=remove', async () => {
      let receivedBody = null;
      const scope = nock(TEST_API_HOST)
        .post(TEST_API_PATH, (body) => {
          receivedBody = body;
          return true;
        })
        .reply(200, { ok: true });

      const service = EmailList(silentLogger);
      await service.unsubscribe({
        email: 'jane@example.com',
        list: 'gladysPlusTrial',
        language: 'fr',
      });

      expect(scope.isDone()).to.equal(true);
      expect(receivedBody).to.deep.equal({
        email: 'jane@example.com',
        list: 'gladysPlusTrial',
        action: 'remove',
        language: 'fr',
      });
    });

    it('should not throw if the EMAIL_LIST_API_URL env var is unset', async () => {
      delete process.env.EMAIL_LIST_API_URL;
      const service = EmailList(silentLogger);
      await service.unsubscribe({
        email: 'jane@example.com',
        list: 'gladysPlusTrial',
        language: 'en',
      });
    });
  });
});
