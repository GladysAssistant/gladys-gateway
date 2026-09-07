const request = require('supertest');
const { expect } = require('chai');
// eslint-disable-next-line import/no-extraneous-dependencies
const nock = require('nock');

const ACCOUNT_WITH_USERS = 'b2d23f66-487d-493f-8acb-9c8adb400def';
const ACCOUNT_WITH_STRIPE = 'be2b9666-5c72-451e-98f4-efca76ffef54';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

function daysAgo(days) {
  return new Date(Date.now() - days * ONE_DAY_IN_MS);
}

function adminRequest(method, url) {
  const req = request(TEST_BACKEND_APP);
  return req[method](url)
    .set('Accept', 'application/json')
    .set('X-Admin-Api-Key', process.env.ADMIN_API_AUTHORIZATION_TOKEN);
}

function nockCustomerSubscriptions(customerId, subscriptions, times = 1) {
  nock('https://api.stripe.com:443', { encodedQueryParams: true })
    .get('/v1/subscriptions')
    .query({ customer: customerId, status: 'all', limit: '100' })
    .times(times)
    .reply(200, { object: 'list', data: subscriptions });
}

const RUNNING_SUBSCRIPTION = {
  id: 'sub_active',
  status: 'active',
  current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
};

function nockSubscription(subscriptionId, subscription) {
  nock('https://api.stripe.com:443', { encodedQueryParams: true })
    .get(`/v1/subscriptions/${subscriptionId}`)
    .reply(200, { id: subscriptionId, ...subscription });
}

describe('POST /admin/api/accounts/sync-stripe', () => {
  // The fixture account is "active" in database while its Stripe subscription ("sub", see
  // test/tasks/nock.js) is canceled: the typical account left behind by a missed webhook.
  it('should report the accounts that differ from Stripe without touching them', async () => {
    const response = await adminRequest('post', '/admin/api/accounts/sync-stripe')
      .send({})
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.include({ execute: false, total: 1, checked: 1, changed: 1, errors: 0 });
    expect(response.body.accounts).to.have.lengthOf(1);
    const [result] = response.body.accounts;
    expect(result).to.include({ id: ACCOUNT_WITH_STRIPE, name: 'new-account-lost@gladysassistant.com', changed: true });
    expect(result.before).to.deep.equal({ status: 'active', plan: 'plus', current_period_end: null });
    expect(result.after).to.include({ status: 'canceled', plan: 'plus' });
    // no end date known anywhere: access ends now
    expect(new Date(result.after.current_period_end).getTime()).to.be.closeTo(Date.now(), 10000);
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_STRIPE });
    expect(account).to.include({ status: 'active' });
    expect(account.current_period_end).to.equal(null);
  });

  it('should write the Stripe values when execute is true', async () => {
    const endedAt = Math.floor(daysAgo(300).getTime() / 1000);
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      { stripe_subscription_id: 'sub_ended', status: 'past_due', plan: 'lite' },
    );
    nockSubscription('sub_ended', {
      status: 'canceled',
      ended_at: endedAt,
      canceled_at: endedAt - 3600,
      current_period_end: endedAt + 30 * 24 * 3600,
      items: { data: [{ price: { product: 'plus-product-id' } }] },
    });
    const response = await adminRequest('post', '/admin/api/accounts/sync-stripe').send({ execute: true }).expect(200);
    expect(response.body).to.deep.include({ execute: true, total: 1, changed: 1, errors: 0 });
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_STRIPE });
    expect(account).to.include({ status: 'canceled', plan: 'plus' });
    // the subscription ended on Stripe side: this is when the access ended
    expect(new Date(account.current_period_end).getTime()).to.equal(endedAt * 1000);
  });

  it('should keep the end of access already in the past for a subscription that is over', async () => {
    const accessEndedAt = daysAgo(400);
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      { stripe_subscription_id: 'sub_ended', status: 'past_due', current_period_end: accessEndedAt },
    );
    nockSubscription('sub_ended', { status: 'canceled', ended_at: Math.floor(daysAgo(300).getTime() / 1000) });
    const response = await adminRequest('post', '/admin/api/accounts/sync-stripe').send({ execute: true }).expect(200);
    expect(response.body.changed).to.equal(1);
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_STRIPE });
    expect(account.status).to.equal('canceled');
    expect(new Date(account.current_period_end).getTime()).to.equal(accessEndedAt.getTime());
  });

  it('should take the period end and the plan of an active subscription', async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 20 * 24 * 3600;
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      { stripe_subscription_id: 'sub_active_lite', status: 'past_due', plan: 'plus' },
    );
    nockSubscription('sub_active_lite', {
      status: 'active',
      current_period_end: periodEnd,
      items: { data: [{ price: { product: process.env.STRIPE_LITE_PLAN_PRODUCT_ID } }] },
    });
    await adminRequest('post', '/admin/api/accounts/sync-stripe').send({ execute: true }).expect(200);
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_STRIPE });
    expect(account).to.include({ status: 'active', plan: 'lite' });
    expect(new Date(account.current_period_end).getTime()).to.equal(periodEnd * 1000);
  });

  it('should not report an account already in sync', async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 20 * 24 * 3600;
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      { stripe_subscription_id: 'sub_in_sync', status: 'active', current_period_end: new Date(periodEnd * 1000) },
    );
    nockSubscription('sub_in_sync', {
      status: 'active',
      current_period_end: periodEnd,
      items: { data: [{ price: { product: 'plus-product-id' } }] },
    });
    const response = await adminRequest('post', '/admin/api/accounts/sync-stripe').send({}).expect(200);
    expect(response.body).to.deep.include({ total: 1, checked: 1, changed: 0, errors: 0 });
    expect(response.body.accounts).to.have.lengthOf(0);
  });

  it('should report an account whose subscription cannot be fetched and continue', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      { stripe_subscription_id: 'sub_stripe_down' },
    );
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/sub_stripe_down')
      .reply(500);
    const response = await adminRequest('post', '/admin/api/accounts/sync-stripe').send({ execute: true }).expect(200);
    expect(response.body).to.deep.include({ total: 1, checked: 0, changed: 0, errors: 1 });
    expect(response.body.accounts[0]).to.include({ id: ACCOUNT_WITH_STRIPE, changed: false });
    expect(response.body.accounts[0]).to.have.property('error');
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_STRIPE });
    expect(account.status).to.equal('active');
  });

  it('should mark canceled an account whose subscription no longer exists on Stripe', async () => {
    const accessEndedAt = daysAgo(400);
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      { stripe_subscription_id: 'sub_gone', status: 'past_due', plan: 'lite', current_period_end: accessEndedAt },
    );
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/sub_gone')
      .reply(404, { error: { type: 'invalid_request_error', code: 'resource_missing' } });
    const response = await adminRequest('post', '/admin/api/accounts/sync-stripe').send({ execute: true }).expect(200);
    expect(response.body).to.deep.include({ total: 1, checked: 1, changed: 1, errors: 0 });
    expect(response.body.accounts[0]).to.include({
      id: ACCOUNT_WITH_STRIPE,
      changed: true,
      stripe_subscription_missing: true,
    });
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_STRIPE });
    // the plan is unknown on Stripe side: kept, the end of access already known is kept too
    expect(account).to.include({ status: 'canceled', plan: 'lite' });
    expect(new Date(account.current_period_end).getTime()).to.equal(accessEndedAt.getTime());
  });

  it('should return 422 with an invalid body', async () => {
    await adminRequest('post', '/admin/api/accounts/sync-stripe').send({ execute: 'maybe' }).expect(422);
  });
});

describe('POST /admin/api/accounts/retention', () => {
  it('should not list accounts whose access has not ended', async () => {
    // fixture accounts: active until 2050, and active created just now (no end of access)
    const response = await adminRequest('post', '/admin/api/accounts/retention')
      .send({})
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.include({
      execute: false,
      grace_period_in_days: 180,
      warning_period_in_days: 30,
      total: 0,
      warned: 0,
      waiting: 0,
      deleted: 0,
      errors: 0,
    });
    expect(response.body.accounts).to.deep.equal([]);
  });

  it('should not list an account whose subscription ended less than the grace period ago', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_USERS },
      { status: 'canceled', current_period_end: daysAgo(100) },
    );
    const response = await adminRequest('post', '/admin/api/accounts/retention').send({}).expect(200);
    expect(response.body.total).to.equal(0);
  });

  it('should never list an internal account', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_USERS },
      { status: 'canceled', current_period_end: daysAgo(400), is_internal: true },
    );
    const response = await adminRequest('post', '/admin/api/accounts/retention').send({}).expect(200);
    expect(response.body.total).to.equal(0);
  });

  it('should plan a warning for an account past the grace period, without acting', async () => {
    const accessEndedAt = daysAgo(200);
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_USERS },
      { status: 'past_due', current_period_end: accessEndedAt },
    );
    const response = await adminRequest('post', '/admin/api/accounts/retention').send({}).expect(200);
    expect(response.body).to.deep.include({ execute: false, total: 1, warned: 1, waiting: 0, deleted: 0, errors: 0 });
    expect(response.body.accounts[0]).to.include({
      id: ACCOUNT_WITH_USERS,
      status: 'past_due',
      access_ended_at: accessEndedAt.toISOString(),
      deletion_warning_sent_at: null,
      action: 'warn',
    });
    expect(new Date(response.body.accounts[0].deletion_date).getTime()).to.be.closeTo(
      Date.now() + 30 * ONE_DAY_IN_MS,
      10000,
    );
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_USERS });
    expect(account.deletion_warning_sent_at).to.equal(null);
  });

  it('should warn the users of the account when execute is true', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_USERS },
      { status: 'canceled', current_period_end: daysAgo(200) },
    );
    const response = await adminRequest('post', '/admin/api/accounts/retention').send({ execute: true }).expect(200);
    expect(response.body).to.deep.include({ execute: true, total: 1, warned: 1, deleted: 0, errors: 0 });
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_USERS });
    expect(new Date(account.deletion_warning_sent_at).getTime()).to.be.closeTo(Date.now(), 10000);
    // a second run waits for the end of the warning period
    const secondResponse = await adminRequest('post', '/admin/api/accounts/retention')
      .send({ execute: true })
      .expect(200);
    expect(secondResponse.body).to.deep.include({ total: 1, warned: 0, waiting: 1, deleted: 0 });
    expect(secondResponse.body.accounts[0]).to.include({ action: 'wait' });
  });

  it('should warn the billing email of an account that never had any user', async () => {
    // The fixture account with a Stripe subscription has no user. It was created now: its
    // creation date is moved back so that it is past the grace period.
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      { status: 'incomplete_expired', current_period_end: null, created_at: daysAgo(200) },
    );
    const response = await adminRequest('post', '/admin/api/accounts/retention').send({ execute: true }).expect(200);
    expect(response.body).to.deep.include({ total: 1, warned: 1, errors: 0 });
    expect(response.body.accounts[0]).to.include({ id: ACCOUNT_WITH_STRIPE, action: 'warn' });
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_STRIPE });
    expect(account.deletion_warning_sent_at).to.not.equal(null);
  });

  it('should warn again when the warning predates the end of access (the customer came back and left again)', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_USERS },
      { status: 'canceled', current_period_end: daysAgo(200), deletion_warning_sent_at: daysAgo(500) },
    );
    const response = await adminRequest('post', '/admin/api/accounts/retention').send({}).expect(200);
    expect(response.body).to.deep.include({ total: 1, warned: 1, deleted: 0 });
    expect(response.body.accounts[0]).to.include({ action: 'warn', deletion_warning_sent_at: null });
  });

  it('should delete the account once the warning period has elapsed', async function Test() {
    this.timeout(10000);
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_USERS },
      { status: 'canceled', current_period_end: daysAgo(200), deletion_warning_sent_at: daysAgo(31) },
    );
    const dryRun = await adminRequest('post', '/admin/api/accounts/retention').send({}).expect(200);
    expect(dryRun.body).to.deep.include({ total: 1, deleted: 1 });
    expect(dryRun.body.accounts[0]).to.include({ action: 'delete' });
    expect(await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_USERS })).to.not.equal(null);

    const response = await adminRequest('post', '/admin/api/accounts/retention').send({ execute: true }).expect(200);
    expect(response.body).to.deep.include({ execute: true, total: 1, warned: 0, waiting: 0, deleted: 1, errors: 0 });
    expect(await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_USERS })).to.equal(null);
    expect(await TEST_DATABASE_INSTANCE.t_user.find({ account_id: ACCOUNT_WITH_USERS })).to.have.lengthOf(0);
    expect(await TEST_DATABASE_INSTANCE.t_instance.find({ account_id: ACCOUNT_WITH_USERS })).to.have.lengthOf(0);
    expect(await TEST_DATABASE_INSTANCE.t_backup.find({ account_id: ACCOUNT_WITH_USERS })).to.have.lengthOf(0);
  });

  it('should refuse to delete an account whose Stripe subscription is still running and report it', async () => {
    // database says the subscription is over, Stripe says otherwise: Stripe wins
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      {
        stripe_subscription_id: 'sub_active',
        stripe_customer_id: 'cus_active',
        status: 'canceled',
        current_period_end: daysAgo(200),
        deletion_warning_sent_at: daysAgo(31),
      },
    );
    nockCustomerSubscriptions('cus_active', [RUNNING_SUBSCRIPTION]);
    const response = await adminRequest('post', '/admin/api/accounts/retention').send({ execute: true }).expect(200);
    expect(response.body).to.deep.include({ total: 1, deleted: 0, errors: 1 });
    expect(response.body.accounts[0]).to.include({ id: ACCOUNT_WITH_STRIPE, action: 'error' });
    expect(response.body.accounts[0].error).to.match(/sync-stripe/);
    expect(await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_STRIPE })).to.not.equal(null);
  });

  it('should not warn an account whose Stripe subscription is still running (database lagging behind)', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      {
        stripe_customer_id: 'cus_active',
        stripe_subscription_id: 'sub_active',
        status: 'past_due',
        current_period_end: daysAgo(200),
      },
    );
    nockCustomerSubscriptions('cus_active', [RUNNING_SUBSCRIPTION]);
    const response = await adminRequest('post', '/admin/api/accounts/retention').send({ execute: true }).expect(200);
    expect(response.body).to.deep.include({ total: 1, warned: 0, deleted: 0, errors: 1 });
    expect(response.body.accounts[0]).to.include({ id: ACCOUNT_WITH_STRIPE, action: 'error' });
    expect(response.body.accounts[0].error).to.match(/sync-stripe/);
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_STRIPE });
    expect(account.deletion_warning_sent_at).to.equal(null);
  });

  it('should not trust the stored subscription: a newer running subscription of the customer protects the account', async () => {
    // the customer re-subscribed but the account still points to the old canceled subscription
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      {
        stripe_customer_id: 'cus_resubscribed',
        stripe_subscription_id: 'sub_old',
        status: 'canceled',
        current_period_end: daysAgo(200),
        deletion_warning_sent_at: daysAgo(31),
      },
    );
    nockCustomerSubscriptions('cus_resubscribed', [
      { id: 'sub_old', status: 'canceled', current_period_end: Math.floor(daysAgo(200).getTime() / 1000) },
      { ...RUNNING_SUBSCRIPTION, id: 'sub_new' },
    ]);
    // dry run checks Stripe too, so the report is honest about what execute would do
    const response = await adminRequest('post', '/admin/api/accounts/retention').send({}).expect(200);
    expect(response.body).to.deep.include({ total: 1, deleted: 0, errors: 1 });
    expect(response.body.accounts[0].error).to.match(/sub_new is active/);
  });

  it('should not trust the stored status: an "active" account whose access ended long ago is a candidate', async () => {
    // missed cancellation webhook: the database still says active, Stripe says canceled
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      { status: 'active', current_period_end: daysAgo(200) },
    );
    const response = await adminRequest('post', '/admin/api/accounts/retention').send({}).expect(200);
    expect(response.body).to.deep.include({ total: 1, warned: 1, errors: 0 });
    expect(response.body.accounts[0]).to.include({ id: ACCOUNT_WITH_STRIPE, status: 'active', action: 'warn' });
  });

  it('should treat a customer that no longer exists on Stripe as having no subscription', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      {
        stripe_customer_id: 'cus_gone',
        stripe_subscription_id: 'sub_gone',
        status: 'canceled',
        current_period_end: daysAgo(200),
      },
    );
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions')
      .query({ customer: 'cus_gone', status: 'all', limit: '100' })
      .reply(404, { error: { type: 'invalid_request_error', code: 'resource_missing' } });
    const response = await adminRequest('post', '/admin/api/accounts/retention').send({}).expect(200);
    expect(response.body).to.deep.include({ total: 1, warned: 1, errors: 0 });
  });

  it('should return 422 with an invalid body', async () => {
    await adminRequest('post', '/admin/api/accounts/retention').send({ execute: 'yes' }).expect(422);
  });
});
