const request = require('supertest');
const { expect } = require('chai');

const ACCOUNT_WITH_USERS = 'b2d23f66-487d-493f-8acb-9c8adb400def';
const ACCOUNT_WITHOUT_USER = 'be2b9666-5c72-451e-98f4-efca76ffef54';
const USER_WITH_TWO_FACTOR = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
const USER_WITHOUT_TWO_FACTOR = '29770e0d-26a9-444e-91a1-f175c99a5218';

function adminRequest(method, url) {
  const req = request(TEST_BACKEND_APP);
  return req[method](url)
    .set('Accept', 'application/json')
    .set('X-Admin-Api-Key', process.env.ADMIN_API_AUTHORIZATION_TOKEN);
}

describe('POST /admin/api/users/:id/reset_two_factor', () => {
  it('should disable two factor and erase the secret and the recovery codes', async () => {
    const before = await TEST_DATABASE_INSTANCE.t_user.findOne({ id: USER_WITH_TWO_FACTOR });
    expect(before.two_factor_enabled).to.equal(true);
    expect(before.two_factor_secret).to.be.a('string');
    expect(before.two_factor_recovery_codes).to.have.lengthOf(2);

    const response = await adminRequest('post', `/admin/api/users/${USER_WITH_TWO_FACTOR}/reset_two_factor`)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.include({
      id: USER_WITH_TWO_FACTOR,
      email: 'email-confirmed-two-factor-enabled@gladysprojet.com',
      two_factor_enabled: false,
    });
    expect(response.body).to.not.have.property('two_factor_secret');
    expect(response.body).to.not.have.property('two_factor_recovery_codes');
    expect(response.body).to.not.have.property('srp_verifier');

    const after = await TEST_DATABASE_INSTANCE.t_user.findOne({ id: USER_WITH_TWO_FACTOR });
    expect(after.two_factor_enabled).to.equal(false);
    expect(after.two_factor_secret).to.equal(null);
    expect(after.two_factor_recovery_codes).to.equal(null);
    // the user keeps his sessions
    const devices = await TEST_DATABASE_INSTANCE.t_device.find({ user_id: USER_WITH_TWO_FACTOR, revoked: false });
    expect(devices).to.have.lengthOf(1);
  });

  it('should work on a user without two factor', async () => {
    const response = await adminRequest('post', `/admin/api/users/${USER_WITHOUT_TWO_FACTOR}/reset_two_factor`).expect(
      200,
    );
    expect(response.body).to.have.property('two_factor_enabled', false);
  });

  it('should return 404 for an unknown user', async () => {
    await adminRequest('post', '/admin/api/users/6b0e4a2e-6fd1-4bc5-9b73-8bd6a1a4f4d1/reset_two_factor').expect(404);
    await adminRequest('post', '/admin/api/users/not-an-uuid/reset_two_factor').expect(404);
  });
});

describe('DELETE /admin/api/users/:id', () => {
  it('should delete a user and everything attached to him', async () => {
    await TEST_DATABASE_INSTANCE.t_open_api_key.insert({
      user_id: USER_WITH_TWO_FACTOR,
      name: 'my key',
      api_key_hash: 'hash',
    });
    await TEST_DATABASE_INSTANCE.t_reset_password.insert({ user_id: USER_WITH_TWO_FACTOR, token_hash: 'token' });

    await adminRequest('delete', `/admin/api/users/${USER_WITH_TWO_FACTOR}`).expect('Content-Type', /json/).expect(200);

    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({ id: USER_WITH_TWO_FACTOR });
    expect(user).to.equal(null);
    const devices = await TEST_DATABASE_INSTANCE.t_device.find({ user_id: USER_WITH_TWO_FACTOR });
    expect(devices).to.have.lengthOf(0);
    const openApiKeys = await TEST_DATABASE_INSTANCE.t_open_api_key.find({ user_id: USER_WITH_TWO_FACTOR });
    expect(openApiKeys).to.have.lengthOf(0);
    const resetPasswords = await TEST_DATABASE_INSTANCE.t_reset_password.find({ user_id: USER_WITH_TWO_FACTOR });
    expect(resetPasswords).to.have.lengthOf(0);
    // the other users of the account are untouched
    const otherUsers = await TEST_DATABASE_INSTANCE.t_user.find({ account_id: ACCOUNT_WITH_USERS });
    expect(otherUsers).to.have.lengthOf(3);
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_USERS });
    expect(account).to.not.equal(null);
  });

  it('should refuse to delete the last user of an account', async () => {
    const lastUser = await TEST_DATABASE_INSTANCE.t_user.insert({
      email: 'last-user@gladysassistant.com',
      email_confirmation_token_hash: 'hash',
      language: 'fr',
      role: 'admin',
      account_id: ACCOUNT_WITHOUT_USER,
    });
    const response = await adminRequest('delete', `/admin/api/users/${lastUser.id}`).expect(403);
    expect(response.body).to.have.property('error_code', 'FORBIDDEN');
    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({ id: lastUser.id });
    expect(user).to.not.equal(null);
  });

  it('should not count revoked users as remaining users', async () => {
    const activeUser = await TEST_DATABASE_INSTANCE.t_user.insert({
      email: 'active-user@gladysassistant.com',
      email_confirmation_token_hash: 'hash',
      language: 'fr',
      role: 'admin',
      account_id: ACCOUNT_WITHOUT_USER,
    });
    const revokedUser = await TEST_DATABASE_INSTANCE.t_user.insert({
      email: 'revoked-user@gladysassistant.com',
      email_confirmation_token_hash: 'hash',
      language: 'fr',
      role: 'user',
      account_id: ACCOUNT_WITHOUT_USER,
      is_deleted: true,
    });
    // the active user is the last one, the revoked user does not count
    await adminRequest('delete', `/admin/api/users/${activeUser.id}`).expect(403);
    // the revoked user can be hard deleted since an active user remains
    await adminRequest('delete', `/admin/api/users/${revokedUser.id}`).expect(200);
    const remainingUsers = await TEST_DATABASE_INSTANCE.t_user.find({ account_id: ACCOUNT_WITHOUT_USER });
    expect(remainingUsers).to.have.lengthOf(1);
    expect(remainingUsers[0].id).to.equal(activeUser.id);
  });

  it('should return 404 for an unknown user', async () => {
    await adminRequest('delete', '/admin/api/users/6b0e4a2e-6fd1-4bc5-9b73-8bd6a1a4f4d1').expect(404);
    await adminRequest('delete', '/admin/api/users/not-an-uuid').expect(404);
  });
});

describe('PATCH /admin/api/users/:id/email', () => {
  const PREVIOUS_EMAIL = 'email-confirmed-two-factor-enabled@gladysprojet.com';
  const NEW_EMAIL = 'new.address@gladysassistant.com';
  // raw token of the valid reset password request of USER_WITH_TWO_FACTOR (fixtures)
  const RESET_PASSWORD_TOKEN =
    'd295b5bcc79c7951a95c24a719a778b6dc18334a9fe175a2807513d6e4d1b9a849fad6fab13adc00cf094636c5ad62263a0469d19447a42a82bd729f8c8e7b07';

  let sentEmails;
  let originalSend;

  beforeEach(() => {
    const { mailService } = TEST_SERVICES;
    originalSend = mailService.send;
    sentEmails = [];
    mailService.send = async (user, template, scope) => {
      sentEmails.push({ email: user.email, language: user.language, template, scope });
    };
  });

  afterEach(() => {
    TEST_SERVICES.mailService.send = originalSend;
  });

  it('should change the email, warn the previous address and invalidate the reset password links', async () => {
    const response = await adminRequest('patch', `/admin/api/users/${USER_WITH_TWO_FACTOR}/email`)
      .send({ email: '  New.Address@GladysAssistant.com ' })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.include({ id: USER_WITH_TWO_FACTOR, email: NEW_EMAIL, email_confirmed: true });
    expect(response.body).to.not.have.property('srp_verifier');
    expect(response.body).to.not.have.property('two_factor_secret');

    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({ id: USER_WITH_TWO_FACTOR });
    expect(user).to.include({ email: NEW_EMAIL, email_confirmed: true, two_factor_enabled: true });
    expect(sentEmails).to.deep.equal([
      { email: PREVIOUS_EMAIL, language: 'en', template: 'email_changed', scope: { newEmail: NEW_EMAIL } },
    ]);
    // the reset password links sent to the previous address stop working
    const pendingResets = await TEST_DATABASE_INSTANCE.t_reset_password.find({
      user_id: USER_WITH_TWO_FACTOR,
      is_deleted: false,
    });
    expect(pendingResets).to.have.lengthOf(0);
    await request(TEST_BACKEND_APP).get(`/users/reset-password/${RESET_PASSWORD_TOKEN}`).expect(404);
    // the user is found with the new address only (login, forgot password)
    await request(TEST_BACKEND_APP).post('/users/login-salt').send({ email: NEW_EMAIL }).expect(200);
    await request(TEST_BACKEND_APP).post('/users/login-salt').send({ email: PREVIOUS_EMAIL }).expect(404);
    await request(TEST_BACKEND_APP).post('/users/forgot-password').send({ email: NEW_EMAIL }).expect(200);
    // sessions are kept, the billing email of the account is not changed
    const devices = await TEST_DATABASE_INSTANCE.t_device.find({ user_id: USER_WITH_TWO_FACTOR, revoked: false });
    expect(devices).to.have.lengthOf(1);
    const account = await TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_WITH_USERS });
    expect(account.name).to.equal(PREVIOUS_EMAIL);
  });

  it('should confirm the new email of a user whose email was never confirmed', async () => {
    const response = await adminRequest('patch', `/admin/api/users/${USER_WITHOUT_TWO_FACTOR}/email`)
      .send({ email: NEW_EMAIL })
      .expect(200);
    expect(response.body).to.include({ email: NEW_EMAIL, email_confirmed: true });
    expect(sentEmails).to.have.lengthOf(1);
    expect(sentEmails[0]).to.include({ email: 'tony.stark@gladysassistant.com', template: 'email_changed' });
  });

  it('should do nothing more than confirming when the email is unchanged', async () => {
    await adminRequest('patch', `/admin/api/users/${USER_WITH_TWO_FACTOR}/email`)
      .send({ email: PREVIOUS_EMAIL.toUpperCase() })
      .expect(200);
    expect(sentEmails).to.have.lengthOf(0);
    await request(TEST_BACKEND_APP).get(`/users/reset-password/${RESET_PASSWORD_TOKEN}`).expect(200);
  });

  it('should return 409 when another active user has this email', async () => {
    const response = await adminRequest('patch', `/admin/api/users/${USER_WITH_TWO_FACTOR}/email`)
      .send({ email: 'Email-Confirmed@gladysprojet.com' })
      .expect(409);
    expect(response.body).to.have.property('error_code', 'ALREADY_EXIST');
    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({ id: USER_WITH_TWO_FACTOR });
    expect(user.email).to.equal(PREVIOUS_EMAIL);
    expect(sentEmails).to.have.lengthOf(0);
  });

  it('should take the email of a user who never confirmed it', async () => {
    // tony.stark@ belongs to USER_WITHOUT_TWO_FACTOR, who never confirmed it
    await adminRequest('patch', `/admin/api/users/${USER_WITH_TWO_FACTOR}/email`)
      .send({ email: 'tony.stark@gladysassistant.com' })
      .expect(200);
  });

  it('should keep the change when the previous address cannot be warned', async () => {
    TEST_SERVICES.mailService.send = async () => {
      throw new Error('SMTP down');
    };
    await adminRequest('patch', `/admin/api/users/${USER_WITH_TWO_FACTOR}/email`)
      .send({ email: NEW_EMAIL })
      .expect(200);
    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({ id: USER_WITH_TWO_FACTOR });
    expect(user.email).to.equal(NEW_EMAIL);
  });

  it('should return 422 with an invalid email', async () => {
    await adminRequest('patch', `/admin/api/users/${USER_WITH_TWO_FACTOR}/email`).send({}).expect(422);
    await adminRequest('patch', `/admin/api/users/${USER_WITH_TWO_FACTOR}/email`)
      .send({ email: 'not-an-email' })
      .expect(422);
    await adminRequest('patch', `/admin/api/users/${USER_WITH_TWO_FACTOR}/email`).send({ email: 42 }).expect(422);
  });

  it('should return 404 for an unknown or deleted user', async () => {
    await adminRequest('patch', '/admin/api/users/6b0e4a2e-6fd1-4bc5-9b73-8bd6a1a4f4d1/email')
      .send({ email: NEW_EMAIL })
      .expect(404);
    await adminRequest('patch', '/admin/api/users/not-an-uuid/email').send({ email: NEW_EMAIL }).expect(404);
    await TEST_DATABASE_INSTANCE.t_user.update({ id: USER_WITHOUT_TWO_FACTOR }, { is_deleted: true });
    await adminRequest('patch', `/admin/api/users/${USER_WITHOUT_TWO_FACTOR}/email`)
      .send({ email: NEW_EMAIL })
      .expect(404);
  });
});
