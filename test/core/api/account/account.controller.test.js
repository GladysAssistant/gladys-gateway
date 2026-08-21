const request = require('supertest');
const nock = require('nock');
const { expect } = require('chai');
const configTest = require('../../../tasks/config');

describe('GET /accounts/users', () => {
  it('should return all users in same account as me', () =>
    request(TEST_BACKEND_APP)
      .get('/accounts/users')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.be.instanceOf(Array);
        response.body.forEach((user) => {
          user.should.have.property('email');
          user.should.have.property('is_invitation');
        });
      }));
});

describe('POST /accounts/subscribe', () => {
  it('should subscribe to monthly plan and return next expiration', () =>
    request(TEST_BACKEND_APP)
      .post('/accounts/subscribe')
      .send({
        stripe_source_id: 'stripe-source-id-sample',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('current_period_end');
      }));
});

describe('POST /accounts/subscribe/new', () => {
  it('should create new customer', () =>
    request(TEST_BACKEND_APP)
      .post('/accounts/subscribe/new')
      .send({
        email: 'toto@toto.fr',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('current_period_end');
      }));
});

describe('POST /accounts/users/:id/revoke', () => {
  it('should revoke a user', () =>
    request(TEST_BACKEND_APP)
      .post('/accounts/users/3b69f1c5-d36c-419d-884c-50b9dd6e33e4/revoke')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('success', true);
      }));
});

describe('GET /accounts/invoices', () => {
  it('should return invoices', () =>
    request(TEST_BACKEND_APP)
      .get('/accounts/invoices')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, [
          {
            id: '88b4b295-deae-4452-a5f0-e67f18cf6abe',
            hosted_invoice_url: 'test',
            invoice_pdf: 'test',
            amount_paid: 999,
            created_at: '2018-10-16T02:21:25.901Z',
          },
        ]);
      }));
});

describe('GET /accounts/stripe_customer_portal/:id', () => {
  it('should redirect to stripe customer portal', async () => {
    await request(TEST_BACKEND_APP)
      .get('/accounts/stripe_customer_portal/5959fcac-71b7-4a0e-8d67-5ab3f616f703')
      .expect(302)
      .then((response) => {
        expect(response.text).to.equal('Found. Redirecting to https://billing.stripe.com/session/SESSION_SECRET');
      });
  });
  it('should return 404 not found', async () => {
    await request(TEST_BACKEND_APP)
      .get('/accounts/stripe_customer_portal/a70ada04-3362-4e6f-b79f-c827d3604354')
      .expect(404);
  });
});

describe('GET /accounts/plan', () => {
  beforeEach(async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      { stripe_customer_id: 'cus2', stripe_subscription_id: 'sub2' },
    );
  });
  it('should return current monthly plan', async () => {
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/sub2')
      .reply(200, {
        current_period_end: 1289482682000, // in 2010
        items: {
          object: 'list',
          data: [
            {
              id: 'si_NBVYq3r2lK1gEk',
              object: 'subscription_item',
              billing_thresholds: null,
              created: 1673936436,
              metadata: {},
              price: {
                id: 'plan_De00Arwr1Or8zh',
                object: 'price',
                active: true,
                billing_scheme: 'per_unit',
                created: 1537510859,
                currency: 'eur',
                custom_unit_amount: null,
                livemode: false,
                lookup_key: null,
                metadata: {},
                nickname: 'Monthly',
                product: 'prod_De00NxBNNLv3Hg',
                recurring: {
                  aggregate_usage: null,
                  interval: 'month',
                  interval_count: 1,
                  usage_type: 'licensed',
                },
                tax_behavior: 'unspecified',
                tiers_mode: null,
                transform_quantity: null,
                type: 'recurring',
                unit_amount: 999,
                unit_amount_decimal: '999',
              },
              quantity: 1,
              subscription: 'sub_1MR8X9KgPjCBPRbMXHG27mhl',
              tax_rates: [],
            },
          ],
          has_more: false,
          url: '/v1/subscription_items?subscription=sub_1MR8X9KgPjCBPRbMXHG27mhl',
        },
      });
    const response = await request(TEST_BACKEND_APP)
      .get('/accounts/plan')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body).to.deep.equal({ plan: 'monthly' });
  });
  it('should return current yearly plan', async () => {
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/sub2')
      .reply(200, {
        current_period_end: 1289482682000, // in 2010
        items: {
          object: 'list',
          data: [
            {
              id: 'si_NBVYq3r2lK1gEk',
              object: 'subscription_item',
              billing_thresholds: null,
              created: 1673936436,
              metadata: {},
              price: {
                id: 'price_1KsN4JKgPjCBPRbMF3Uxsja8',
                object: 'price',
                active: true,
                billing_scheme: 'per_unit',
                created: 1537510859,
                currency: 'eur',
                custom_unit_amount: null,
                livemode: false,
                lookup_key: null,
                metadata: {},
                nickname: 'Monthly',
                product: 'prod_De00NxBNNLv3Hg',
                recurring: {
                  aggregate_usage: null,
                  interval: 'month',
                  interval_count: 1,
                  usage_type: 'licensed',
                },
                tax_behavior: 'unspecified',
                tiers_mode: null,
                transform_quantity: null,
                type: 'recurring',
                unit_amount: 999,
                unit_amount_decimal: '999',
              },
              quantity: 1,
              subscription: 'sub_1MR8X9KgPjCBPRbMXHG27mhl',
              tax_rates: [],
            },
          ],
          has_more: false,
          url: '/v1/subscription_items?subscription=sub_1MR8X9KgPjCBPRbMXHG27mhl',
        },
      });
    const response = await request(TEST_BACKEND_APP)
      .get('/accounts/plan')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body).to.deep.equal({ plan: 'yearly' });
  });
  it('should return 400 unknown plan', async () => {
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/sub2')
      .reply(200, {
        current_period_end: 1289482682000, // in 2010
        items: {
          object: 'list',
          data: [],
          has_more: false,
          url: '/v1/subscription_items?subscription=sub_1MR8X9KgPjCBPRbMXHG27mhl',
        },
      });
    const response = await request(TEST_BACKEND_APP)
      .get('/accounts/plan')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(400);
    expect(response.body).to.deep.equal({
      error_code: 'BAD_REQUEST',
      error_message: 'Unknown plan',
      status: 400,
    });
  });
});

describe('POST /accounts/upgrade-to-yearly', () => {
  beforeEach(async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      { stripe_customer_id: 'cus2', stripe_subscription_id: 'sub2' },
    );
  });
  it('should update account to yearly plan', async () => {
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/sub2')
      .reply(200, {
        id: 'sub2',
        current_period_end: 1289482682000, // in 2010
        items: {
          object: 'list',
          data: [
            {
              id: 'si_NBVYq3r2lK1gEk',
              object: 'subscription_item',
              billing_thresholds: null,
              created: 1673936436,
              metadata: {},
              price: {
                id: 'plan_De00Arwr1Or8zh',
                object: 'price',
                active: true,
                billing_scheme: 'per_unit',
                created: 1537510859,
                currency: 'eur',
                custom_unit_amount: null,
                livemode: false,
                lookup_key: null,
                metadata: {},
                nickname: 'Monthly',
                product: 'prod_De00NxBNNLv3Hg',
                recurring: {
                  aggregate_usage: null,
                  interval: 'month',
                  interval_count: 1,
                  usage_type: 'licensed',
                },
                tax_behavior: 'unspecified',
                tiers_mode: null,
                transform_quantity: null,
                type: 'recurring',
                unit_amount: 999,
                unit_amount_decimal: '999',
              },
              quantity: 1,
              subscription: 'sub_1MR8X9KgPjCBPRbMXHG27mhl',
              tax_rates: [],
            },
          ],
          has_more: false,
          url: '/v1/subscription_items?subscription=sub_1MR8X9KgPjCBPRbMXHG27mhl',
        },
      });
    nock('https://api.stripe.com:443', { encodedQueryParams: true }).post('/v1/subscriptions/sub2').reply(200, {
      current_period_end: 1289482682000, // in 2010
    });
    const response = await request(TEST_BACKEND_APP)
      .post('/accounts/upgrade-to-yearly')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body).to.deep.equal({ success: true });
  });
});

describe('GET /accounts/source', () => {
  beforeEach(async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      { stripe_customer_id: 'cus2', stripe_subscription_id: 'sub2' },
    );
  });
  const CURRENT_PERIOD_END = 1750000000; // seconds, as returned by Stripe
  // Matches only a query asking for exactly these Stripe expansions, whatever
  // key format the query parser produced (expand[] or expand[0]/expand[1]).
  const expectsExpansions =
    (...expansions) =>
    (actualQuery) => {
      const values = Object.entries(actualQuery)
        .filter(([key]) => key === 'expand' || key.startsWith('expand['))
        .flatMap(([, value]) => (Array.isArray(value) ? value : [value]));
      return values.length === expansions.length && expansions.every((expansion) => values.includes(expansion));
    };
  const nockSubscription = (subscription = {}) =>
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/sub2')
      .reply(200, {
        id: 'sub2',
        canceled_at: null,
        current_period_end: CURRENT_PERIOD_END,
        default_payment_method: null,
        ...subscription,
      });
  const nockCustomer = (customer) =>
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/customers/cus2')
      .query(expectsExpansions('sources', 'invoice_settings.default_payment_method'))
      .reply(200, customer);
  it('should return a legacy card source', async () => {
    nockCustomer({
      id: 'cus2',
      invoice_settings: { default_payment_method: null },
      sources: {
        data: [{ brand: 'Visa', country: 'FR', exp_month: 12, exp_year: 2030, last4: '4242' }],
      },
    });
    nockSubscription();
    const response = await request(TEST_BACKEND_APP)
      .get('/accounts/source')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body).to.deep.equal({
      type: 'card',
      brand: 'Visa',
      country: 'FR',
      exp_month: 12,
      exp_year: 2030,
      last4: '4242',
      canceled_at: null,
      current_period_end: new Date(CURRENT_PERIOD_END * 1000).toISOString(),
    });
  });
  it('should return the card set as default PaymentMethod on the customer', async () => {
    nockCustomer({
      id: 'cus2',
      invoice_settings: {
        default_payment_method: {
          id: 'pm_1',
          object: 'payment_method',
          type: 'card',
          card: { brand: 'mastercard', country: 'FR', exp_month: 4, exp_year: 2031, last4: '4444' },
        },
      },
      sources: { data: [] },
    });
    nockSubscription();
    const response = await request(TEST_BACKEND_APP)
      .get('/accounts/source')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body).to.deep.equal({
      type: 'card',
      brand: 'mastercard',
      country: 'FR',
      exp_month: 4,
      exp_year: 2031,
      last4: '4444',
      canceled_at: null,
      current_period_end: new Date(CURRENT_PERIOD_END * 1000).toISOString(),
    });
  });
  it('should return a PayPal default PaymentMethod', async () => {
    nockCustomer({
      id: 'cus2',
      invoice_settings: {
        default_payment_method: {
          id: 'pm_2',
          object: 'payment_method',
          type: 'paypal',
          paypal: { payer_email: 'user@example.com' },
        },
      },
      sources: { data: [] },
    });
    nockSubscription();
    const response = await request(TEST_BACKEND_APP)
      .get('/accounts/source')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body).to.deep.equal({
      type: 'paypal',
      brand: null,
      country: null,
      exp_month: null,
      exp_year: null,
      last4: null,
      canceled_at: null,
      current_period_end: new Date(CURRENT_PERIOD_END * 1000).toISOString(),
    });
  });
  it('should return the payment method kept as default on the subscription (Stripe Checkout)', async () => {
    nockCustomer({
      id: 'cus2',
      invoice_settings: { default_payment_method: null },
      sources: { data: [] },
    });
    nockSubscription({ default_payment_method: 'pm_3' });
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/payment_methods/pm_3')
      .reply(200, {
        id: 'pm_3',
        object: 'payment_method',
        type: 'card',
        card: { brand: 'visa', country: 'DE', exp_month: 7, exp_year: 2032, last4: '1234' },
      });
    const response = await request(TEST_BACKEND_APP)
      .get('/accounts/source')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body).to.deep.equal({
      type: 'card',
      brand: 'visa',
      country: 'DE',
      exp_month: 7,
      exp_year: 2032,
      last4: '1234',
      canceled_at: null,
      current_period_end: new Date(CURRENT_PERIOD_END * 1000).toISOString(),
    });
  });
  it('should prefer the subscription default over the customer default, like Stripe does', async () => {
    nockCustomer({
      id: 'cus2',
      invoice_settings: {
        default_payment_method: {
          id: 'pm_customer',
          object: 'payment_method',
          type: 'card',
          card: { brand: 'mastercard', country: 'FR', exp_month: 4, exp_year: 2031, last4: '4444' },
        },
      },
      sources: { data: [] },
    });
    nockSubscription({ default_payment_method: 'pm_sub' });
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/payment_methods/pm_sub')
      .reply(200, {
        id: 'pm_sub',
        object: 'payment_method',
        type: 'card',
        card: { brand: 'visa', country: 'DE', exp_month: 7, exp_year: 2032, last4: '1234' },
      });
    const response = await request(TEST_BACKEND_APP)
      .get('/accounts/source')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body).to.deep.equal({
      type: 'card',
      brand: 'visa',
      country: 'DE',
      exp_month: 7,
      exp_year: 2032,
      last4: '1234',
      canceled_at: null,
      current_period_end: new Date(CURRENT_PERIOD_END * 1000).toISOString(),
    });
  });
  it('should return null when the account has no payment method at all', async () => {
    nockCustomer({
      id: 'cus2',
      invoice_settings: { default_payment_method: null },
      sources: { data: [] },
    });
    nockSubscription();
    const response = await request(TEST_BACKEND_APP)
      .get('/accounts/source')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body).to.equal(null);
  });
});
