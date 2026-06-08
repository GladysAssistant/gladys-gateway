const { expect } = require('chai');
const tracer = require('tracer');
const OpenPanelService = require('../../../core/service/openpanel');

const silentLogger = tracer.colorConsole({ level: 'error' });
const TEST_OPENPANEL_API_URL = 'https://openpanel.test.example.com';

function installOpenPanelFetchMock(apiUrl, handler) {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith(`${apiUrl}/track`)) {
      return handler(url, options);
    }
    return originalFetch(url, options);
  };

  return () => {
    global.fetch = originalFetch;
  };
}

describe('openpanel service', () => {
  let originalClientId;
  let originalClientSecret;
  let originalApiUrl;
  let restoreFetch;

  beforeEach(() => {
    originalClientId = process.env.OPENPANEL_CLIENT_ID;
    originalClientSecret = process.env.OPENPANEL_CLIENT_SECRET;
    originalApiUrl = process.env.OPENPANEL_API_URL;
    process.env.OPENPANEL_CLIENT_ID = 'test-client-id';
    process.env.OPENPANEL_CLIENT_SECRET = 'test-client-secret';
    process.env.OPENPANEL_API_URL = TEST_OPENPANEL_API_URL;
  });

  afterEach(() => {
    if (restoreFetch) {
      restoreFetch();
      restoreFetch = null;
    }
    if (originalClientId === undefined) {
      delete process.env.OPENPANEL_CLIENT_ID;
    } else {
      process.env.OPENPANEL_CLIENT_ID = originalClientId;
    }
    if (originalClientSecret === undefined) {
      delete process.env.OPENPANEL_CLIENT_SECRET;
    } else {
      process.env.OPENPANEL_CLIENT_SECRET = originalClientSecret;
    }
    if (originalApiUrl === undefined) {
      delete process.env.OPENPANEL_API_URL;
    } else {
      process.env.OPENPANEL_API_URL = originalApiUrl;
    }
  });

  describe('trackRevenueFromCheckoutSession', () => {
    it('should POST a revenue event to the configured API URL', async () => {
      let receivedUrl = null;
      let receivedBody = null;
      restoreFetch = installOpenPanelFetchMock(TEST_OPENPANEL_API_URL, async (url, options) => {
        receivedUrl = url;
        receivedBody = JSON.parse(options.body);
        return {
          status: 200,
          text: async () => JSON.stringify({ deviceId: 'device-abc', sessionId: 'session-abc' }),
        };
      });

      const service = OpenPanelService(silentLogger);
      await service.trackRevenueFromCheckoutSession({
        amount_total: 999,
        currency: 'eur',
        metadata: {
          device_id: 'device-abc',
          plan: 'plus',
        },
      });

      expect(receivedUrl).to.equal(`${TEST_OPENPANEL_API_URL}/track`);
      expect(receivedBody).to.deep.equal({
        type: 'track',
        payload: {
          name: 'revenue',
          properties: {
            currency: 'eur',
            plan: 'plus',
            __deviceId: 'device-abc',
            __revenue: 9.99,
          },
        },
      });
    });

    it('should omit plan when metadata.plan is missing', async () => {
      let receivedBody = null;
      restoreFetch = installOpenPanelFetchMock(TEST_OPENPANEL_API_URL, async (url, options) => {
        receivedBody = JSON.parse(options.body);
        return {
          status: 200,
          text: async () => JSON.stringify({ deviceId: 'device-abc', sessionId: 'session-abc' }),
        };
      });

      const service = OpenPanelService(silentLogger);
      await service.trackRevenueFromCheckoutSession({
        amount_total: 500,
        currency: 'usd',
        metadata: {
          device_id: 'device-abc',
        },
      });

      expect(receivedBody.payload.properties).to.deep.equal({
        currency: 'usd',
        __deviceId: 'device-abc',
        __revenue: 5,
      });
    });

    it('should not call OpenPanel when device_id is missing', async () => {
      let fetchCalled = false;
      restoreFetch = installOpenPanelFetchMock(TEST_OPENPANEL_API_URL, async () => {
        fetchCalled = true;
        return {
          status: 200,
          text: async () => '{}',
        };
      });

      const service = OpenPanelService(silentLogger);
      await service.trackRevenueFromCheckoutSession({
        amount_total: 999,
        currency: 'eur',
        metadata: {},
      });

      expect(fetchCalled).to.equal(false);
    });

    it('should not call OpenPanel when amount_total is missing', async () => {
      let fetchCalled = false;
      restoreFetch = installOpenPanelFetchMock(TEST_OPENPANEL_API_URL, async () => {
        fetchCalled = true;
        return {
          status: 200,
          text: async () => '{}',
        };
      });

      const service = OpenPanelService(silentLogger);
      await service.trackRevenueFromCheckoutSession({
        currency: 'eur',
        metadata: {
          device_id: 'device-abc',
        },
      });

      expect(fetchCalled).to.equal(false);
    });

    it('should not throw when OpenPanel credentials are unset', async () => {
      delete process.env.OPENPANEL_CLIENT_ID;
      delete process.env.OPENPANEL_CLIENT_SECRET;

      const service = OpenPanelService(silentLogger);
      await service.trackRevenueFromCheckoutSession({
        amount_total: 999,
        currency: 'eur',
        metadata: {
          device_id: 'device-abc',
        },
      });
    });

    it('should not throw when OpenPanel API returns an error', async () => {
      restoreFetch = installOpenPanelFetchMock(TEST_OPENPANEL_API_URL, async () => ({
        status: 401,
        text: async () => '{}',
      }));

      const service = OpenPanelService(silentLogger);
      await service.trackRevenueFromCheckoutSession({
        amount_total: 999,
        currency: 'eur',
        metadata: {
          device_id: 'device-abc',
        },
      });
    });
  });
});
