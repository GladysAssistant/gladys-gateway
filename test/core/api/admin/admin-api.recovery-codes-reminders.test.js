const request = require('supertest');
const { expect } = require('chai');

const ACCOUNT_WITH_USERS = 'b2d23f66-487d-493f-8acb-9c8adb400def';
// The fixture user having two factor enabled (with recovery codes, see test/tasks/fixtures/t_user.js)
const TWO_FACTOR_USER = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
const USER_WITHOUT_TWO_FACTOR = '29770e0d-26a9-444e-91a1-f175c99a5218';

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

describe('POST /admin/api/users/recovery-codes-reminders', () => {
  // A user who enabled two factor before the recovery codes existed has NULL, a user who
  // used every code is left with an empty array: both are without codes.
  function givenUserWithoutRecoveryCodes(values = {}) {
    return TEST_DATABASE_INSTANCE.t_user.update(
      { id: TWO_FACTOR_USER },
      { two_factor_recovery_codes: null, ...values },
    );
  }

  function getUser() {
    return TEST_DATABASE_INSTANCE.t_user.findOne({ id: TWO_FACTOR_USER });
  }

  it('should not list a user having recovery codes', async () => {
    const response = await adminRequest('post', '/admin/api/users/recovery-codes-reminders')
      .send({})
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({
      execute: false,
      interval_in_days: 90,
      total: 0,
      reminded: 0,
      errors: 0,
      users: [],
    });
  });

  it('should plan a reminder for a user without recovery codes, without acting', async () => {
    await givenUserWithoutRecoveryCodes({ language: 'fr' });
    const response = await adminRequest('post', '/admin/api/users/recovery-codes-reminders').send({}).expect(200);
    expect(response.body).to.deep.include({ execute: false, interval_in_days: 90, total: 1, reminded: 1, errors: 0 });
    expect(response.body.users).to.deep.equal([
      {
        id: TWO_FACTOR_USER,
        email: 'email-confirmed-two-factor-enabled@gladysprojet.com',
        account_id: ACCOUNT_WITH_USERS,
        language: 'fr',
        last_reminder_sent_at: null,
        action: 'remind',
      },
    ]);
    const user = await getUser();
    expect(user.recovery_codes_reminder_sent_at).to.equal(null);
  });

  it('should remind the user when execute is true, then again once the interval has elapsed', async () => {
    await givenUserWithoutRecoveryCodes();
    const response = await adminRequest('post', '/admin/api/users/recovery-codes-reminders')
      .send({ execute: true })
      .expect(200);
    expect(response.body).to.deep.include({ execute: true, total: 1, reminded: 1, errors: 0 });
    const user = await getUser();
    expect(new Date(user.recovery_codes_reminder_sent_at).getTime()).to.be.closeTo(Date.now(), 10000);
    // just reminded: a second run leaves the user alone
    const secondResponse = await adminRequest('post', '/admin/api/users/recovery-codes-reminders')
      .send({ execute: true })
      .expect(200);
    expect(secondResponse.body).to.deep.include({ total: 0, reminded: 0 });
    // the interval has elapsed and the codes still do not exist: reminded again
    const lastReminder = daysAgo(91);
    await givenUserWithoutRecoveryCodes({ recovery_codes_reminder_sent_at: lastReminder });
    const thirdResponse = await adminRequest('post', '/admin/api/users/recovery-codes-reminders')
      .send({ execute: true })
      .expect(200);
    expect(thirdResponse.body).to.deep.include({ total: 1, reminded: 1, errors: 0 });
    expect(thirdResponse.body.users[0]).to.include({
      id: TWO_FACTOR_USER,
      last_reminder_sent_at: lastReminder.toISOString(),
      action: 'remind',
    });
    const userAfter = await getUser();
    expect(new Date(userAfter.recovery_codes_reminder_sent_at).getTime()).to.be.closeTo(Date.now(), 10000);
  });

  it('should not list a user reminded less than the interval ago', async () => {
    await givenUserWithoutRecoveryCodes({ recovery_codes_reminder_sent_at: daysAgo(89) });
    const response = await adminRequest('post', '/admin/api/users/recovery-codes-reminders').send({}).expect(200);
    expect(response.body.total).to.equal(0);
  });

  it('should list a user who used every recovery code', async () => {
    await givenUserWithoutRecoveryCodes({ two_factor_recovery_codes: [] });
    const response = await adminRequest('post', '/admin/api/users/recovery-codes-reminders').send({}).expect(200);
    expect(response.body.total).to.equal(1);
    expect(response.body.users[0]).to.include({ id: TWO_FACTOR_USER, action: 'remind' });
  });

  it('should not list a user without two factor authentication', async () => {
    await givenUserWithoutRecoveryCodes({ two_factor_enabled: false });
    const response = await adminRequest('post', '/admin/api/users/recovery-codes-reminders').send({}).expect(200);
    expect(response.body.total).to.equal(0);
  });

  it('should not list a user whose email is not confirmed', async () => {
    await givenUserWithoutRecoveryCodes({ email_confirmed: false });
    const response = await adminRequest('post', '/admin/api/users/recovery-codes-reminders').send({}).expect(200);
    expect(response.body.total).to.equal(0);
  });

  it('should not list a deleted user', async () => {
    await givenUserWithoutRecoveryCodes({ is_deleted: true });
    const response = await adminRequest('post', '/admin/api/users/recovery-codes-reminders').send({}).expect(200);
    expect(response.body.total).to.equal(0);
  });

  it('should not list a user of an account whose subscription is over', async () => {
    await givenUserWithoutRecoveryCodes();
    await TEST_DATABASE_INSTANCE.t_account.update({ id: ACCOUNT_WITH_USERS }, { status: 'canceled' });
    const response = await adminRequest('post', '/admin/api/users/recovery-codes-reminders').send({}).expect(200);
    expect(response.body.total).to.equal(0);
  });

  it('should never list a user of an internal account', async () => {
    await givenUserWithoutRecoveryCodes();
    await TEST_DATABASE_INSTANCE.t_account.update({ id: ACCOUNT_WITH_USERS }, { is_internal: true });
    const response = await adminRequest('post', '/admin/api/users/recovery-codes-reminders').send({}).expect(200);
    expect(response.body.total).to.equal(0);
  });

  it('should report an error and continue when the email cannot be sent', async () => {
    await givenUserWithoutRecoveryCodes();
    const { mailService } = TEST_SERVICES;
    const originalSend = mailService.send;
    mailService.send = async () => {
      throw new Error('SMTP down');
    };
    try {
      const response = await adminRequest('post', '/admin/api/users/recovery-codes-reminders')
        .send({ execute: true })
        .expect(200);
      expect(response.body).to.deep.include({ total: 1, reminded: 0, errors: 1 });
      expect(response.body.users[0]).to.include({ id: TWO_FACTOR_USER, action: 'error', error: 'SMTP down' });
    } finally {
      mailService.send = originalSend;
    }
    // not marked as reminded: the next run will retry
    const user = await getUser();
    expect(user.recovery_codes_reminder_sent_at).to.equal(null);
  });

  it('should return 422 with an invalid body', async () => {
    await adminRequest('post', '/admin/api/users/recovery-codes-reminders').send({ execute: 'yes' }).expect(422);
  });

  it('should refuse a call without admin credentials', async () => {
    await request(TEST_BACKEND_APP)
      .post('/admin/api/users/recovery-codes-reminders')
      .set('Accept', 'application/json')
      .send({})
      .expect(401);
  });
});

describe('POST /admin/api/users/:id/recovery-codes-reminder', () => {
  it('should send the reminder to the user right away and record the date', async () => {
    // reminded yesterday and having recovery codes: the manual send ignores both
    await TEST_DATABASE_INSTANCE.t_user.update(
      { id: TWO_FACTOR_USER },
      { recovery_codes_reminder_sent_at: daysAgo(1), language: 'fr' },
    );
    const response = await adminRequest('post', `/admin/api/users/${TWO_FACTOR_USER}/recovery-codes-reminder`)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.include({
      id: TWO_FACTOR_USER,
      email: 'email-confirmed-two-factor-enabled@gladysprojet.com',
      account_id: ACCOUNT_WITH_USERS,
      language: 'fr',
      two_factor_enabled: true,
      has_recovery_codes: true,
    });
    expect(new Date(response.body.reminder_sent_at).getTime()).to.be.closeTo(Date.now(), 10000);
    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({ id: TWO_FACTOR_USER });
    expect(new Date(user.recovery_codes_reminder_sent_at).getTime()).to.be.closeTo(Date.now(), 10000);
  });

  it('should send the reminder to a user without two factor nor recovery codes', async () => {
    const response = await adminRequest(
      'post',
      `/admin/api/users/${USER_WITHOUT_TWO_FACTOR}/recovery-codes-reminder`,
    ).expect(200);
    expect(response.body).to.include({
      id: USER_WITHOUT_TWO_FACTOR,
      two_factor_enabled: false,
      has_recovery_codes: false,
    });
  });

  it('should return 404 for an unknown or deleted user', async () => {
    await adminRequest('post', '/admin/api/users/6b0e4a2e-6fd1-4bc5-9b73-8bd6a1a4f4d1/recovery-codes-reminder').expect(
      404,
    );
    await adminRequest('post', '/admin/api/users/not-an-uuid/recovery-codes-reminder').expect(404);
    await TEST_DATABASE_INSTANCE.t_user.update({ id: TWO_FACTOR_USER }, { is_deleted: true });
    await adminRequest('post', `/admin/api/users/${TWO_FACTOR_USER}/recovery-codes-reminder`).expect(404);
  });

  it('should refuse a call without admin credentials', async () => {
    await request(TEST_BACKEND_APP)
      .post(`/admin/api/users/${TWO_FACTOR_USER}/recovery-codes-reminder`)
      .set('Accept', 'application/json')
      .expect(401);
  });
});
