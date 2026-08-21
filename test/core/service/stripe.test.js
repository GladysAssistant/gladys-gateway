const { expect } = require('chai');
const tracer = require('tracer');

const silentLogger = tracer.colorConsole({ level: 'error' });
const STRIPE_SERVICE_PATH = '../../../core/service/stripe';

describe('stripe service without STRIPE_SECRET_KEY', () => {
  let originalEnv;
  let stripeService;

  // The stripe client is created at require time: a fresh copy of the module
  // must be loaded with the env variable unset to exercise the disabled-Stripe
  // paths, without touching the instance the test server already holds.
  beforeEach(() => {
    originalEnv = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    delete require.cache[require.resolve(STRIPE_SERVICE_PATH)];
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const StripeService = require(STRIPE_SERVICE_PATH);
    stripeService = StripeService(silentLogger);
  });

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = originalEnv;
    delete require.cache[require.resolve(STRIPE_SERVICE_PATH)];
  });

  it('should resolve null in getCard', async () => {
    const card = await stripeService.getCard('cus');
    expect(card).to.equal(null);
  });

  it('should resolve null in getPaymentMethod', async () => {
    const paymentMethod = await stripeService.getPaymentMethod('pm');
    expect(paymentMethod).to.equal(null);
  });
});
