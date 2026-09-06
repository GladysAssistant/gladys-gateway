const request = require('supertest');
const { expect } = require('chai');
// eslint-disable-next-line import/no-extraneous-dependencies
const nock = require('nock');

const ACCOUNT_WITH_USERS = 'b2d23f66-487d-493f-8acb-9c8adb400def';
const ACCOUNT_WITH_STRIPE = 'be2b9666-5c72-451e-98f4-efca76ffef54';

function adminRequest(method, url) {
  const req = request(TEST_BACKEND_APP);
  return req[method](url)
    .set('Accept', 'application/json')
    .set('X-Admin-Api-Key', process.env.ADMIN_API_AUTHORIZATION_TOKEN);
}

describe('GET /admin/api/accounts', () => {
  it('should list all accounts with their user count', async () => {
    const response = await adminRequest('get', '/admin/api/accounts').expect('Content-Type', /json/).expect(200);
    expect(response.body).to.deep.include({ total: 2, limit: 50, offset: 0 });
    expect(response.body.accounts).to.have.lengthOf(2);
    const account = response.body.accounts.find((a) => a.id === ACCOUNT_WITH_USERS);
    expect(account).to.include({
      name: 'email-confirmed-two-factor-enabled@gladysprojet.com',
      plan: 'plus',
      status: 'active',
      user_count: 4,
    });
    expect(account).to.not.have.property('total_count');
    expect(account).to.not.have.property('stripe_portal_key');
  });

  it('should not count revoked users', async () => {
    await TEST_DATABASE_INSTANCE.t_user.update({ id: '29770e0d-26a9-444e-91a1-f175c99a5218' }, { is_deleted: true });
    const response = await adminRequest('get', '/admin/api/accounts').expect(200);
    const account = response.body.accounts.find((a) => a.id === ACCOUNT_WITH_USERS);
    expect(account).to.have.property('user_count', 3);
  });

  it('should search by user email (partial, case insensitive)', async () => {
    const response = await adminRequest('get', '/admin/api/accounts?search=TONY.STARK').expect(200);
    expect(response.body.total).to.equal(1);
    expect(response.body.accounts[0].id).to.equal(ACCOUNT_WITH_USERS);
  });

  it('should search by account email', async () => {
    const response = await adminRequest('get', '/admin/api/accounts?search=new-account-lost').expect(200);
    expect(response.body.total).to.equal(1);
    expect(response.body.accounts[0].id).to.equal(ACCOUNT_WITH_STRIPE);
  });

  it('should search by user id', async () => {
    const response = await adminRequest(
      'get',
      '/admin/api/accounts?search=29770e0d-26a9-444e-91a1-f175c99a5218',
    ).expect(200);
    expect(response.body.total).to.equal(1);
    expect(response.body.accounts[0].id).to.equal(ACCOUNT_WITH_USERS);
  });

  it('should search by account id', async () => {
    const response = await adminRequest('get', `/admin/api/accounts?search=${ACCOUNT_WITH_STRIPE}`).expect(200);
    expect(response.body.total).to.equal(1);
    expect(response.body.accounts[0].id).to.equal(ACCOUNT_WITH_STRIPE);
  });

  it('should not treat like wildcards in search as wildcards', async () => {
    const response = await adminRequest('get', '/admin/api/accounts?search=%25').expect(200);
    expect(response.body.total).to.equal(0);
    expect(response.body.accounts).to.have.lengthOf(0);
  });

  it('should paginate', async () => {
    const firstPage = await adminRequest('get', '/admin/api/accounts?limit=1&offset=0').expect(200);
    expect(firstPage.body).to.deep.include({ total: 2, limit: 1, offset: 0 });
    expect(firstPage.body.accounts).to.have.lengthOf(1);
    const secondPage = await adminRequest('get', '/admin/api/accounts?limit=1&offset=1').expect(200);
    expect(secondPage.body.accounts).to.have.lengthOf(1);
    expect(secondPage.body.accounts[0].id).to.not.equal(firstPage.body.accounts[0].id);
  });

  it('should return 422 with an invalid limit', async () => {
    await adminRequest('get', '/admin/api/accounts?limit=1000').expect(422);
    await adminRequest('get', '/admin/api/accounts?limit=abc').expect(422);
  });
});

describe('GET /admin/api/accounts/:id', () => {
  it('should return the account with its users, instances, backups and usage points', async () => {
    await TEST_DATABASE_INSTANCE.t_enedis_usage_point.insert({
      usage_point_id: '1111111111',
      account_id: ACCOUNT_WITH_USERS,
    });
    const response = await adminRequest('get', `/admin/api/accounts/${ACCOUNT_WITH_USERS}`)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body.account).to.include({
      id: ACCOUNT_WITH_USERS,
      name: 'email-confirmed-two-factor-enabled@gladysprojet.com',
      plan: 'plus',
      status: 'active',
    });
    expect(response.body.account).to.not.have.property('stripe_portal_key');
    expect(response.body.users).to.have.lengthOf(4);
    const userWithTwoFactor = response.body.users.find((u) => u.id === 'a139e4a6-ec6c-442d-9730-0499155d38d4');
    expect(userWithTwoFactor).to.include({
      email: 'email-confirmed-two-factor-enabled@gladysprojet.com',
      two_factor_enabled: true,
      role: 'admin',
    });
    expect(userWithTwoFactor.devices).to.have.property('active_count', 1);
    expect(userWithTwoFactor.devices).to.have.property('last_seen', '2018-10-16T02:21:25.901Z');
    const userWithoutDevice = response.body.users.find((u) => u.id === '29770e0d-26a9-444e-91a1-f175c99a5218');
    expect(userWithoutDevice.devices).to.deep.equal({ active_count: 0, last_seen: null });
    // sensitive fields are never exposed
    response.body.users.forEach((user) => {
      expect(user).to.not.have.property('two_factor_secret');
      expect(user).to.not.have.property('two_factor_recovery_codes');
      expect(user).to.not.have.property('srp_verifier');
      expect(user).to.not.have.property('srp_salt');
      expect(user).to.not.have.property('rsa_encrypted_private_key');
      expect(user).to.not.have.property('ecdsa_encrypted_private_key');
      expect(user).to.not.have.property('email_confirmation_token_hash');
    });
    expect(response.body.instances).to.have.lengthOf(1);
    expect(response.body.instances[0]).to.include({
      id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      name: 'Raspberry Pi 1',
      is_deleted: false,
    });
    expect(response.body.instances[0]).to.not.have.property('refresh_token_hash');
    expect(response.body.backups.length).to.be.at.least(2);
    expect(response.body.backups.length).to.be.at.most(5);
    expect(response.body.backups[0]).to.have.all.keys('id', 'size', 'status', 'created_at', 'updated_at');
    expect(response.body.enedis_usage_points).to.deep.include({
      usage_point_id: '1111111111',
      created_at: response.body.enedis_usage_points[0].created_at,
    });
    // no stripe subscription on this account
    expect(response.body.stripe).to.equal(null);
  });

  it('should return revoked users flagged as deleted', async () => {
    await TEST_DATABASE_INSTANCE.t_user.update({ id: '29770e0d-26a9-444e-91a1-f175c99a5218' }, { is_deleted: true });
    const response = await adminRequest('get', `/admin/api/accounts/${ACCOUNT_WITH_USERS}`).expect(200);
    expect(response.body.users).to.have.lengthOf(4);
    const revokedUser = response.body.users.find((u) => u.id === '29770e0d-26a9-444e-91a1-f175c99a5218');
    expect(revokedUser).to.have.property('is_deleted', true);
    expect(response.body.users.filter((u) => u.is_deleted === false)).to.have.lengthOf(3);
  });

  it('should return the stripe subscription summary', async () => {
    const response = await adminRequest('get', `/admin/api/accounts/${ACCOUNT_WITH_STRIPE}`).expect(200);
    expect(response.body.stripe).to.deep.equal({
      subscription_id: 'sub',
      status: 'canceled',
      cancel_at_period_end: false,
      current_period_end: '2010-11-11T13:38:02.000Z',
    });
    expect(response.body.users).to.have.lengthOf(0);
  });

  it('should return null stripe summary when stripe fails', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      { stripe_subscription_id: 'sub_stripe_down' },
    );
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/sub_stripe_down')
      .reply(500);
    const response = await adminRequest('get', `/admin/api/accounts/${ACCOUNT_WITH_STRIPE}`).expect(200);
    expect(response.body.stripe).to.equal(null);
  });

  it('should return 404 for an unknown account', async () => {
    await adminRequest('get', '/admin/api/accounts/6b0e4a2e-6fd1-4bc5-9b73-8bd6a1a4f4d1').expect(404);
  });

  it('should return 404 for an invalid id', async () => {
    await adminRequest('get', '/admin/api/accounts/not-an-uuid').expect(404);
  });
});

describe('DELETE /admin/api/accounts/:id', () => {
  it('should delete an account whose subscription is over', async function Test() {
    this.timeout(5000);
    await adminRequest('delete', `/admin/api/accounts/${ACCOUNT_WITH_STRIPE}`)
      .expect('Content-Type', /json/)
      .expect(200);
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_STRIPE });
    expect(account).to.equal(null);
  });

  it('should delete an account that never subscribed, with its AI usage', async function Test() {
    this.timeout(5000);
    await TEST_DATABASE_INSTANCE.t_ai_usage.insert({
      account_id: ACCOUNT_WITH_USERS,
      instance_id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      request_type: 'text',
      total_tokens: 42,
    });
    await adminRequest('delete', `/admin/api/accounts/${ACCOUNT_WITH_USERS}`).expect(200);
    const aiUsage = await TEST_DATABASE_INSTANCE.t_ai_usage.find({ account_id: ACCOUNT_WITH_USERS });
    expect(aiUsage).to.have.lengthOf(0);
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_USERS });
    expect(account).to.equal(null);
    const users = await TEST_DATABASE_INSTANCE.t_user.find({ account_id: ACCOUNT_WITH_USERS });
    expect(users).to.have.lengthOf(0);
    const instances = await TEST_DATABASE_INSTANCE.t_instance.find({ account_id: ACCOUNT_WITH_USERS });
    expect(instances).to.have.lengthOf(0);
  });

  it('should refuse to delete an account with an active subscription', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: ACCOUNT_WITH_STRIPE },
      { stripe_subscription_id: 'sub_active', stripe_customer_id: 'cus_active' },
    );
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/subscriptions/sub_active')
      .reply(200, {
        id: 'sub_active',
        status: 'active',
        current_period_end: Math.round(new Date().getTime() / 1000) + 30 * 24 * 60 * 60,
      });
    nock('https://api.stripe.com:443', { encodedQueryParams: true })
      .get('/v1/customers/cus_active')
      .reply(200, { id: 'cus_active', email: 'cus@cus.fr' });
    const response = await adminRequest('delete', `/admin/api/accounts/${ACCOUNT_WITH_STRIPE}`).expect(403);
    expect(response.body).to.have.property('error_code', 'FORBIDDEN');
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_STRIPE });
    expect(account).to.not.equal(null);
  });

  it('should return 404 for an unknown account', async () => {
    await adminRequest('delete', '/admin/api/accounts/6b0e4a2e-6fd1-4bc5-9b73-8bd6a1a4f4d1').expect(404);
  });
});
