const request = require('supertest');
const nock = require('nock');
const { expect } = require('chai');
const Stripe = require('stripe');
const { setupPersistentNocks } = require('../../../tasks/nock');
const { computeTrackingToken, hashToken } = require('../../../../core/api/starter-kit/starter-kit.model');

const STARTER_KIT_PRODUCT_ID = 'prod_starter_kit';

function signEvent(stripe, event) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_ENDPOINT_SECRET,
  });
  return { payload, signature };
}

function mockStripeCustomerAndSubscription(customerId, subscriptionId, email, times = 1) {
  nock('https://api.stripe.com:443', { encodedQueryParams: true })
    .get(`/v1/subscriptions/${subscriptionId}`)
    .times(times)
    .reply(200, {
      id: subscriptionId,
      current_period_end: 1289482682000,
      status: 'trialing',
      items: { data: [{ price: { product: 'plus-plan-id' } }] },
    });
  nock('https://api.stripe.com:443', { encodedQueryParams: true })
    .get(`/v1/customers/${customerId}`)
    .times(times)
    .reply(200, { id: customerId, email, name: 'Patrice Dupont' });
}

function mockLineItems(sessionId, productId, times = 1) {
  nock('https://api.stripe.com:443', { encodedQueryParams: true })
    .get(`/v1/checkout/sessions/${sessionId}/line_items`)
    .query(true)
    .times(times)
    .reply(200, {
      object: 'list',
      data: [
        { id: 'li_1', quantity: 1, price: { id: 'price_kit', product: productId } },
        { id: 'li_2', quantity: 1, price: { id: 'price_plus', product: 'plus-plan-id' } },
      ],
    });
}

describe('stripeWebhook - starter kit', () => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  beforeEach(() => {
    process.env.STRIPE_STARTER_KIT_PRODUCT_ID = STARTER_KIT_PRODUCT_ID;
    process.env.STARTER_KIT_TRACKING_URL = 'https://gladysassistant.com/{language}/starter-kit/tracking';
  });
  afterEach(() => {
    delete process.env.STRIPE_STARTER_KIT_PRODUCT_ID;
    nock.cleanAll();
    setupPersistentNocks();
  });

  it('should create the Gladys Plus account AND a starter kit order for a starter kit checkout', async () => {
    const event = {
      id: 'evt_starter_kit',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_starter_kit_1',
          customer: 'cus_kit_1',
          subscription: 'sub_kit_1',
          payment_intent: 'pi_kit_1',
          locale: 'fr',
          amount_total: 39900,
          currency: 'eur',
          customer_details: {
            email: 'Patrice.Dupont@Test.fr',
            name: 'Patrice Dupont',
            phone: '+33612345678',
            address: { line1: '12 rue des Lilas', postal_code: '75011', city: 'Paris', country: 'FR' },
          },
          shipping_details: {
            name: 'Patrice Dupont',
            address: { line1: '12 rue des Lilas', line2: null, postal_code: '75011', city: 'Paris', country: 'FR' },
          },
        },
      },
    };
    mockStripeCustomerAndSubscription('cus_kit_1', 'sub_kit_1', 'patrice.dupont@test.fr');
    mockLineItems('cs_starter_kit_1', STARTER_KIT_PRODUCT_ID);
    const { payload, signature } = signEvent(stripe, event);
    await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('stripe-signature', signature)
      .set('Content-type', 'application/json')
      .send(payload)
      .expect(200);

    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ stripe_customer_id: 'cus_kit_1' });
    expect(account).to.have.property('name', 'patrice.dupont@test.fr');

    const order = await TEST_DATABASE_INSTANCE.t_starter_kit_order.findOne({
      stripe_checkout_session_id: 'cs_starter_kit_1',
    });
    expect(order).to.include({
      account_id: account.id,
      email: 'patrice.dupont@test.fr',
      customer_name: 'Patrice Dupont',
      phone: '+33612345678',
      language: 'fr',
      status: 'paid',
      stripe_customer_id: 'cus_kit_1',
      stripe_payment_intent_id: 'pi_kit_1',
      amount_total: 39900,
      currency: 'eur',
    });
    expect(order.shipping_address).to.include({ line1: '12 rue des Lilas', postal_code: '75011', city: 'Paris' });
    expect(order.tracking_token_hash).to.equal(hashToken(computeTrackingToken(order.id)));
    expect(order.ssh_password).to.have.lengthOf(16);
    expect(order.paid_at).to.not.equal(null);

    const events = await TEST_DATABASE_INSTANCE.t_starter_kit_order_event.find(
      { order_id: order.id },
      { order: [{ field: 'created_at', direction: 'asc' }] },
    );
    expect(events.map((e) => e.type)).to.deep.equal(['status_changed', 'email_sent']);
    expect(events[1].payload).to.deep.equal({ template: 'starter_kit_order_confirmed' });
  });

  it('should not create the order twice when Stripe retries the webhook', async () => {
    const session = {
      id: 'cs_starter_kit_retry',
      customer: 'cus_kit_retry',
      subscription: 'sub_kit_retry',
      locale: 'fr',
      customer_details: { email: 'retry@test.fr', name: 'Retry' },
    };
    const event = { id: 'evt_retry', object: 'event', type: 'checkout.session.completed', data: { object: session } };
    mockStripeCustomerAndSubscription('cus_kit_retry', 'sub_kit_retry', 'retry@test.fr', 2);
    mockLineItems('cs_starter_kit_retry', STARTER_KIT_PRODUCT_ID, 2);
    const { payload, signature } = signEvent(stripe, event);
    await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('stripe-signature', signature)
      .set('Content-type', 'application/json')
      .send(payload)
      .expect(200);
    await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('stripe-signature', signature)
      .set('Content-type', 'application/json')
      .send(payload)
      .expect(200);
    const orders = await TEST_DATABASE_INSTANCE.t_starter_kit_order.find({
      stripe_checkout_session_id: 'cs_starter_kit_retry',
    });
    expect(orders).to.have.lengthOf(1);
  });

  it('should NOT create an order for a regular Gladys Plus checkout', async () => {
    const session = { id: 'cs_regular', customer: 'cus_regular', subscription: 'sub_regular', locale: 'en' };
    const event = { id: 'evt_regular', object: 'event', type: 'checkout.session.completed', data: { object: session } };
    mockStripeCustomerAndSubscription('cus_regular', 'sub_regular', 'regular@test.fr');
    mockLineItems('cs_regular', 'prod_something_else');
    const { payload, signature } = signEvent(stripe, event);
    await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('stripe-signature', signature)
      .set('Content-type', 'application/json')
      .send(payload)
      .expect(200);
    const orders = await TEST_DATABASE_INSTANCE.t_starter_kit_order.find({ stripe_checkout_session_id: 'cs_regular' });
    expect(orders).to.have.lengthOf(0);
  });

  it('should create an order without account for a starter kit session flagged in metadata without subscription', async () => {
    const session = {
      id: 'cs_metadata',
      customer: null,
      subscription: null,
      locale: 'en',
      metadata: { starter_kit: 'true' },
      customer_details: { email: 'metadata@test.fr', name: 'Meta Data' },
    };
    const event = {
      id: 'evt_metadata',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: session },
    };
    const { payload, signature } = signEvent(stripe, event);
    await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('stripe-signature', signature)
      .set('Content-type', 'application/json')
      .send(payload)
      .expect(200);
    const order = await TEST_DATABASE_INSTANCE.t_starter_kit_order.findOne({
      stripe_checkout_session_id: 'cs_metadata',
    });
    expect(order).to.include({ email: 'metadata@test.fr', language: 'en', account_id: null, status: 'paid' });
  });
});
