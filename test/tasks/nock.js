// eslint-disable-next-line import/no-extraneous-dependencies
const nock = require('nock');

// nock.recorder.rec();

nock('https://api.stripe.com:443', { encodedQueryParams: true })
  .post('/v1/customers', () => true)
  .reply(200, {
    id: 'cus',
  })
  .persist();

nock('https://api.stripe.com:443', { encodedQueryParams: true })
  .post('/v1/subscriptions', () => true)
  .reply(200, {
    id: 'sub',
    current_period_end: new Date().getTime() + 24 * 60 * 60 * 1000,
  })
  .persist();

nock('https://api.stripe.com:443', { encodedQueryParams: true })
  .get('/v1/customers/cus')
  .reply(200, {
    id: 'cus',
    email: 'cus@cus.fr',
  })
  .persist();
nock('https://api.stripe.com:443', { encodedQueryParams: true })
  .get('/v1/subscriptions/sub')
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
  })
  .persist();

nock('https://api.stripe.com:443', { encodedQueryParams: true })
  .post('/v1/billing_portal/sessions')
  .reply(200, {
    id: 'pts_1G8ZkbClCIKljWvsk5O2fhg6',
    object: 'billing_portal.session',
    created: 1580854809,
    customer: 'cus_IQ3EZdskEYMlCQ',
    livemode: false,
    return_url: 'https://example.com/account',
    url: 'https://billing.stripe.com/session/SESSION_SECRET',
  })
  .persist();

nock('https://test.test-endpoint.com')
  .delete('/un-backup.enc', () => true)
  .reply(200, '<xml></xml>')
  .persist();
