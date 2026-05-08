const request = require('supertest');
const nock = require('nock');
const { expect } = require('chai');
const Stripe = require('stripe');

describe('stripeWebhook', () => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  beforeEach(async () => {});
  it('should create new account with plus plan', async () => {
    const event = {
      id: 'evt_test_webhook',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cusnew',
          subscription: 'subnew',
        },
      },
    };
    const stringEvent = JSON.stringify(event);
    const signatureHeader = stripe.webhooks.generateTestHeaderString({
      payload: stringEvent,
      secret: process.env.STRIPE_ENDPOINT_SECRET,
    });
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/subnew')
      .reply(200, {
        id: 'subnew',
        current_period_end: 1289482682000, // in 2010
        items: {
          data: [
            {
              price: {
                product: 'plus-plan-id',
              },
            },
          ],
        },
      });
    nock('https://api.stripe.com:443', { encodedQueryParams: true }).get('/v1/customers/cusnew').reply(200, {
      id: 'cusnew',
      email: 'toto@test.fr',
    });
    const response = await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('Accept', 'application/json')
      .set('stripe-signature', signatureHeader)
      .set('Content-type', 'application/json')
      .send(stringEvent)
      .expect(200);

    expect(response.body).to.deep.equal({ success: true });
    const accountUpdated = await TEST_DATABASE_INSTANCE.t_account.findOne({
      stripe_customer_id: 'cusnew',
    });
    expect(accountUpdated).to.have.property('status', 'active');
    expect(accountUpdated).to.have.property('plan', 'plus');
  });
  it('should try to create account 2 times', async () => {
    const event = {
      id: 'evt_test_webhook',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cusnew',
          subscription: 'subnew',
        },
      },
    };
    const stringEvent = JSON.stringify(event);
    const signatureHeader = stripe.webhooks.generateTestHeaderString({
      payload: stringEvent,
      secret: process.env.STRIPE_ENDPOINT_SECRET,
    });
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/subnew')
      .reply(200, {
        id: 'subnew',
        current_period_end: 1289482682000, // in 2010
        items: {
          data: [
            {
              price: {
                product: 'plus-plan-id',
              },
            },
          ],
        },
      });
    nock('https://api.stripe.com:443', { encodedQueryParams: true }).get('/v1/customers/cusnew').reply(200, {
      id: 'cusnew',
      email: 'toto@test.fr',
    });
    const response = await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('Accept', 'application/json')
      .set('stripe-signature', signatureHeader)
      .set('Content-type', 'application/json')
      .send(stringEvent)
      .expect(200);

    expect(response.body).to.deep.equal({ success: true });
    const accountUpdated = await TEST_DATABASE_INSTANCE.t_account.findOne({
      stripe_customer_id: 'cusnew',
    });
    expect(accountUpdated).to.have.property('status', 'active');
    expect(accountUpdated).to.have.property('plan', 'plus');
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/subnew')
      .reply(200, {
        id: 'subnew',
        current_period_end: 1289482682000, // in 2010
        items: {
          data: [
            {
              price: {
                product: 'plus-plan-id',
              },
            },
          ],
        },
      });
    nock('https://api.stripe.com:443', { encodedQueryParams: true }).get('/v1/customers/cusnew').reply(200, {
      id: 'cusnew',
      email: 'toto@test.fr',
    });
    await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('Accept', 'application/json')
      .set('stripe-signature', signatureHeader)
      .set('Content-type', 'application/json')
      .send(stringEvent)
      .expect(409);
  });
  it('should create new account with lite plan', async () => {
    const event = {
      id: 'evt_test_webhook',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cusnew',
          subscription: 'subnew',
        },
      },
    };
    const stringEvent = JSON.stringify(event);
    const signatureHeader = stripe.webhooks.generateTestHeaderString({
      payload: stringEvent,
      secret: process.env.STRIPE_ENDPOINT_SECRET,
    });
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/subnew')
      .reply(200, {
        id: 'subnew',
        current_period_end: 1289482682000, // in 2010
        items: {
          data: [
            {
              price: {
                product: process.env.STRIPE_LITE_PLAN_PRODUCT_ID,
              },
            },
          ],
        },
      });
    nock('https://api.stripe.com:443', { encodedQueryParams: true }).get('/v1/customers/cusnew').reply(200, {
      id: 'cusnew',
      email: 'toto@test.fr',
    });
    const response = await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('Accept', 'application/json')
      .set('stripe-signature', signatureHeader)
      .set('Content-type', 'application/json')
      .send(stringEvent)
      .expect(200);

    expect(response.body).to.deep.equal({ success: true });
    const accountUpdated = await TEST_DATABASE_INSTANCE.t_account.findOne({
      stripe_customer_id: 'cusnew',
    });
    expect(accountUpdated).to.have.property('status', 'active');
    expect(accountUpdated).to.have.property('plan', 'lite');
  });
  it('should let user switch from one subscription to another', async () => {
    // First, subscribe to "lite"
    const event = {
      id: 'evt_test_webhook',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cusnew',
          subscription: 'subnew',
        },
      },
    };
    const stringEvent = JSON.stringify(event);
    const signatureHeader = stripe.webhooks.generateTestHeaderString({
      payload: stringEvent,
      secret: process.env.STRIPE_ENDPOINT_SECRET,
    });
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/subnew')
      .reply(200, {
        id: 'subnew',
        current_period_end: 1289482682000, // in 2010
        items: {
          data: [
            {
              price: {
                product: process.env.STRIPE_LITE_PLAN_PRODUCT_ID,
              },
            },
          ],
        },
      });
    nock('https://api.stripe.com:443', { encodedQueryParams: true }).get('/v1/customers/cusnew').reply(200, {
      id: 'cusnew',
      email: 'toto@test.fr',
    });
    const response = await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('Accept', 'application/json')
      .set('stripe-signature', signatureHeader)
      .set('Content-type', 'application/json')
      .send(stringEvent)
      .expect(200);

    expect(response.body).to.deep.equal({ success: true });
    const accountUpdated = await TEST_DATABASE_INSTANCE.t_account.findOne({
      stripe_customer_id: 'cusnew',
    });
    expect(accountUpdated).to.have.property('status', 'active');
    expect(accountUpdated).to.have.property('plan', 'lite');
    // Then, upgrade to "plus"
    const updateEvent = {
      id: 'evt_test_webhook',
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'subnew',
          customer: 'cusnew',
          status: 'active',
          current_period_end: (new Date().getTime() + 10 * 60 * 1000) / 1000,
          items: {
            data: [
              {
                price: {
                  product: 'plus-plan-id',
                },
              },
            ],
          },
        },
      },
    };
    const stringUpdateEvent = JSON.stringify(updateEvent);
    const signatureUpdateHeader = stripe.webhooks.generateTestHeaderString({
      payload: stringUpdateEvent,
      secret: process.env.STRIPE_ENDPOINT_SECRET,
    });
    await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('Accept', 'application/json')
      .set('stripe-signature', signatureUpdateHeader)
      .set('Content-type', 'application/json')
      .send(stringUpdateEvent)
      .expect(200);
    const accountUpdatedToPlus = await TEST_DATABASE_INSTANCE.t_account.findOne({
      stripe_customer_id: 'cusnew',
    });
    expect(accountUpdatedToPlus).to.have.property('status', 'active');
    expect(accountUpdatedToPlus).to.have.property('plan', 'plus');
  });
  it('should delete subscription', async () => {
    // First create subscription
    const event = {
      id: 'evt_test_webhook',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cusnew',
          subscription: 'subnew',
        },
      },
    };
    const stringEvent = JSON.stringify(event);
    const signatureHeader = stripe.webhooks.generateTestHeaderString({
      payload: stringEvent,
      secret: process.env.STRIPE_ENDPOINT_SECRET,
    });
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/subnew')
      .reply(200, {
        id: 'subnew',
        current_period_end: 1289482682000, // in 2010
        items: {
          data: [
            {
              price: {
                product: 'plus-plan-id',
              },
            },
          ],
        },
      });
    nock('https://api.stripe.com:443', { encodedQueryParams: true }).get('/v1/customers/cusnew').reply(200, {
      id: 'cusnew',
      email: 'toto@test.fr',
    });
    await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('Accept', 'application/json')
      .set('stripe-signature', signatureHeader)
      .set('Content-type', 'application/json')
      .send(stringEvent)
      .expect(200);

    const deleteEVent = {
      id: 'evt_test_webhook',
      object: 'event',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'subnew',
          customer: 'cusnew',
        },
      },
    };
    const stringDeleteEvent = JSON.stringify(deleteEVent);
    const signatureDeleteHeader = stripe.webhooks.generateTestHeaderString({
      payload: stringDeleteEvent,
      secret: process.env.STRIPE_ENDPOINT_SECRET,
    });
    await request(TEST_BACKEND_APP)
      .post('/stripe/webhook')
      .set('Accept', 'application/json')
      .set('stripe-signature', signatureDeleteHeader)
      .set('Content-type', 'application/json')
      .send(stringDeleteEvent)
      .expect(200);
  });

  describe('email list trial subscription', () => {
    const EMAIL_LIST_HOST = 'https://email-list.test.example.com';
    const EMAIL_LIST_PATH = '/subscribers';
    let originalEmailListUrl;

    beforeEach(() => {
      originalEmailListUrl = process.env.EMAIL_LIST_API_URL;
      process.env.EMAIL_LIST_API_URL = `${EMAIL_LIST_HOST}${EMAIL_LIST_PATH}`;
    });

    afterEach(() => {
      if (originalEmailListUrl === undefined) {
        delete process.env.EMAIL_LIST_API_URL;
      } else {
        process.env.EMAIL_LIST_API_URL = originalEmailListUrl;
      }
      nock.cleanAll();
    });

    function buildCheckoutSessionEvent({ trialStart, trialEnd, customerName, locale }) {
      const event = {
        id: 'evt_test_webhook',
        object: 'event',
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cusnew',
            subscription: 'subnew',
            locale,
          },
        },
      };
      const stringEvent = JSON.stringify(event);
      const signatureHeader = stripe.webhooks.generateTestHeaderString({
        payload: stringEvent,
        secret: process.env.STRIPE_ENDPOINT_SECRET,
      });
      nock('https://api.stripe.com:443', { encodedQueryParams: true })
        .get('/v1/subscriptions/subnew')
        .reply(200, {
          id: 'subnew',
          current_period_end: 1289482682000,
          trial_start: trialStart,
          trial_end: trialEnd,
          items: {
            data: [
              {
                price: {
                  product: 'plus-plan-id',
                },
              },
            ],
          },
        });
      nock('https://api.stripe.com:443', { encodedQueryParams: true }).get('/v1/customers/cusnew').reply(200, {
        id: 'cusnew',
        email: 'newtrial@test.fr',
        name: customerName,
      });
      return { stringEvent, signatureHeader };
    }

    it('should subscribe a new 30-day trial customer to the gladysPlusTrial email list', async () => {
      const trialStart = Math.floor(Date.now() / 1000);
      const trialEnd = trialStart + 30 * 24 * 60 * 60;
      const { stringEvent, signatureHeader } = buildCheckoutSessionEvent({
        trialStart,
        trialEnd,
        customerName: 'Jane Doe',
        locale: 'fr-FR',
      });

      let receivedBody = null;
      const emailListScope = nock(EMAIL_LIST_HOST)
        .post(EMAIL_LIST_PATH, (body) => {
          receivedBody = body;
          return true;
        })
        .reply(200, { ok: true });

      await request(TEST_BACKEND_APP)
        .post('/stripe/webhook')
        .set('Accept', 'application/json')
        .set('stripe-signature', signatureHeader)
        .set('Content-type', 'application/json')
        .send(stringEvent)
        .expect(200);

      expect(emailListScope.isDone()).to.equal(true);
      expect(receivedBody).to.deep.equal({
        email: 'newtrial@test.fr',
        firstname: 'Jane',
        list: 'gladysPlusTrial',
        language: 'fr',
      });
    });

    it('should NOT subscribe a 6-month trial customer (starter kit) to the email list', async () => {
      const trialStart = Math.floor(Date.now() / 1000);
      const trialEnd = trialStart + 180 * 24 * 60 * 60;
      const { stringEvent, signatureHeader } = buildCheckoutSessionEvent({
        trialStart,
        trialEnd,
        customerName: 'Jane Doe',
        locale: 'fr-FR',
      });

      const emailListScope = nock(EMAIL_LIST_HOST).post(EMAIL_LIST_PATH).reply(200, { ok: true });

      await request(TEST_BACKEND_APP)
        .post('/stripe/webhook')
        .set('Accept', 'application/json')
        .set('stripe-signature', signatureHeader)
        .set('Content-type', 'application/json')
        .send(stringEvent)
        .expect(200);

      // The interceptor should NOT have been consumed.
      expect(emailListScope.isDone()).to.equal(false);
    });

    it('should NOT subscribe to the email list when there is no trial at all', async () => {
      const { stringEvent, signatureHeader } = buildCheckoutSessionEvent({
        trialStart: null,
        trialEnd: null,
        customerName: 'Jane Doe',
        locale: 'fr-FR',
      });

      const emailListScope = nock(EMAIL_LIST_HOST).post(EMAIL_LIST_PATH).reply(200, { ok: true });

      await request(TEST_BACKEND_APP)
        .post('/stripe/webhook')
        .set('Accept', 'application/json')
        .set('stripe-signature', signatureHeader)
        .set('Content-type', 'application/json')
        .send(stringEvent)
        .expect(200);

      expect(emailListScope.isDone()).to.equal(false);
    });

    it('should unsubscribe from the trial list on subscription transition trialing -> active', async () => {
      // Use the existing fixture account whose stripe_customer_id is 'cus'.
      const updateEvent = {
        id: 'evt_test_webhook',
        object: 'event',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub',
            customer: 'cus',
            status: 'active',
            current_period_end: (new Date().getTime() + 10 * 60 * 1000) / 1000,
            items: {
              data: [
                {
                  price: {
                    product: 'plus-plan-id',
                  },
                },
              ],
            },
          },
          previous_attributes: {
            status: 'trialing',
          },
        },
      };
      const stringUpdateEvent = JSON.stringify(updateEvent);
      const signatureUpdateHeader = stripe.webhooks.generateTestHeaderString({
        payload: stringUpdateEvent,
        secret: process.env.STRIPE_ENDPOINT_SECRET,
      });

      let receivedBody = null;
      const emailListScope = nock(EMAIL_LIST_HOST)
        .post(EMAIL_LIST_PATH, (body) => {
          receivedBody = body;
          return true;
        })
        .reply(200, { ok: true });

      await request(TEST_BACKEND_APP)
        .post('/stripe/webhook')
        .set('Accept', 'application/json')
        .set('stripe-signature', signatureUpdateHeader)
        .set('Content-type', 'application/json')
        .send(stringUpdateEvent)
        .expect(200);

      expect(emailListScope.isDone()).to.equal(true);
      expect(receivedBody).to.deep.equal({
        email: 'new-account-lost@gladysassistant.com',
        list: 'gladysPlusTrial',
        action: 'remove',
        language: 'fr',
      });
    });

    it('should NOT unsubscribe on subscription update that is not a trialing -> active transition', async () => {
      const updateEvent = {
        id: 'evt_test_webhook',
        object: 'event',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub',
            customer: 'cus',
            status: 'active',
            current_period_end: (new Date().getTime() + 10 * 60 * 1000) / 1000,
            items: {
              data: [
                {
                  price: {
                    product: 'plus-plan-id',
                  },
                },
              ],
            },
          },
          previous_attributes: {
            // already active, just a normal renewal-type update
            current_period_end: 12345,
          },
        },
      };
      const stringUpdateEvent = JSON.stringify(updateEvent);
      const signatureUpdateHeader = stripe.webhooks.generateTestHeaderString({
        payload: stringUpdateEvent,
        secret: process.env.STRIPE_ENDPOINT_SECRET,
      });

      const emailListScope = nock(EMAIL_LIST_HOST).post(EMAIL_LIST_PATH).reply(200, { ok: true });

      await request(TEST_BACKEND_APP)
        .post('/stripe/webhook')
        .set('Accept', 'application/json')
        .set('stripe-signature', signatureUpdateHeader)
        .set('Content-type', 'application/json')
        .send(stringUpdateEvent)
        .expect(200);

      expect(emailListScope.isDone()).to.equal(false);
    });
  });
});
