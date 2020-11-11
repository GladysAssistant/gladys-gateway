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
  })
  .persist();
