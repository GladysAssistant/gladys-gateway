const request = require('supertest');
const { expect } = require('chai');
const { io } = require('socket.io-client');
const Jwt = require('../../../../core/service/jwt');
const configTest = require('../../../tasks/config');

const INSTANCE_ID = '0bc53f3c-1e11-40d3-99a4-bd392a666eaf';
const ACCOUNT_ID = 'b2d23f66-487d-493f-8acb-9c8adb400def';
// admin of the account, owner of configTest.jwtAccessTokenDashboard
const ADMIN_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
// the other confirmed admins of the account
const OTHER_ADMIN_IDS = ['3b69f1c5-d36c-419d-884c-50b9dd6e33e4', 'bdb1a902-a65e-46f9-8c2a-5c09840e2e10'];
// admin whose email is not confirmed
const UNCONFIRMED_ADMIN_ID = '29770e0d-26a9-444e-91a1-f175c99a5218';

const ONE_MINUTE_IN_MS = 60 * 1000;

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * ONE_MINUTE_IN_MS);
}

function adminRequest(method, url) {
  const req = request(TEST_BACKEND_APP);
  return req[method](url)
    .set('Accept', 'application/json')
    .set('X-Admin-Api-Key', process.env.ADMIN_API_AUTHORIZATION_TOKEN);
}

function runWatchdog(body) {
  return adminRequest('post', '/admin/api/instances/watchdog').send(body).expect('Content-Type', /json/).expect(200);
}

function updateAlert(body, accessToken = configTest.jwtAccessTokenDashboard) {
  return request(TEST_BACKEND_APP)
    .patch('/accounts/instance-offline-alert')
    .set('Accept', 'application/json')
    .set('Authorization', accessToken)
    .send(body);
}

function getMe() {
  return request(TEST_BACKEND_APP)
    .get('/users/me')
    .set('Accept', 'application/json')
    .set('Authorization', configTest.jwtAccessTokenDashboard)
    .expect(200);
}

function enableAlert(values = {}) {
  return TEST_DATABASE_INSTANCE.t_account.update(
    { id: ACCOUNT_ID },
    { instance_offline_alert_enabled: true, instance_offline_alert_delay_in_minutes: 60, ...values },
  );
}

function getAccount() {
  return TEST_DATABASE_INSTANCE.t_account.findOne({ id: ACCOUNT_ID });
}

function getInstance() {
  return TEST_DATABASE_INSTANCE.t_instance.findOne({ id: INSTANCE_ID });
}

const recipientIds = (instance) => instance.recipients.map((recipient) => recipient.id).sort();
const CONFIRMED_ADMIN_IDS = [ADMIN_ID, ...OTHER_ADMIN_IDS].sort();

// Connect the fixture instance in websocket to the given server (the two test servers
// share the same Redis adapter: the watchdog must see it whatever the node)
function connectInstance(port = process.env.SERVER_PORT) {
  return new Promise((resolve, reject) => {
    const jwt = Jwt();
    const socket = io(`http://localhost:${port}`, {
      auth: { auth_type: 'instance', access_token: jwt.generateAccessTokenInstance({ id: INSTANCE_ID }) },
    });
    socket.on('instance-authenticated', () => resolve(socket));
    socket.on('instance-authentication-failed', (data) => reject(new Error(data.reason)));
  });
}

async function waitFor(condition, timeoutInMs = 3000) {
  const start = Date.now();
  // eslint-disable-next-line no-await-in-loop
  while (!(await condition())) {
    if (Date.now() - start > timeoutInMs) {
      throw new Error('Timeout waiting for condition');
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
}

describe('Instance offline alert settings (GET /users/me, PATCH /accounts/instance-offline-alert)', () => {
  it('should be disabled by default with a delay of one hour', async () => {
    const response = await getMe();
    expect(response.body).to.include({
      instance_offline_alert_enabled: false,
      instance_offline_alert_delay_in_minutes: 60,
    });
  });

  it('should enable the alert with a custom delay, as an admin', async () => {
    const response = await updateAlert({ enabled: true, delay_in_minutes: 30 })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({ enabled: true, delay_in_minutes: 30 });
    const account = await getAccount();
    expect(account).to.include({ instance_offline_alert_enabled: true, instance_offline_alert_delay_in_minutes: 30 });
    // visible to every user of the account
    const me = await getMe();
    expect(me.body).to.include({ instance_offline_alert_enabled: true, instance_offline_alert_delay_in_minutes: 30 });
  });

  it('should change one field only', async () => {
    await enableAlert({ instance_offline_alert_delay_in_minutes: 120 });
    const response = await updateAlert({ enabled: false }).expect(200);
    expect(response.body).to.deep.equal({ enabled: false, delay_in_minutes: 120 });
  });

  it('should refuse a delay shorter than 5 minutes or longer than 7 days, and an empty body', async () => {
    await updateAlert({ delay_in_minutes: 1 }).expect(422);
    await updateAlert({ delay_in_minutes: 8 * 24 * 60 }).expect(422);
    await updateAlert({}).expect(422);
    const account = await getAccount();
    expect(account).to.include({ instance_offline_alert_enabled: false, instance_offline_alert_delay_in_minutes: 60 });
  });

  it('should answer 404 for a user that no longer exists', async () => {
    const jwt = Jwt();
    const token = jwt.generateAccessToken({ id: '1dd07393-f052-4395-bbd7-dc932e2a2f4b' }, ['dashboard:write']);
    await updateAlert({ enabled: true }, token).expect(404);
  });

  it('should refuse a user who is not admin of the account', async () => {
    await TEST_DATABASE_INSTANCE.t_user.update({ id: ADMIN_ID }, { role: 'user' });
    await updateAlert({ enabled: true }).expect(403);
    const account = await getAccount();
    expect(account.instance_offline_alert_enabled).to.equal(false);
  });
});

describe('POST /admin/api/instances/watchdog', () => {
  it('should require the admin API key', async () => {
    await request(TEST_BACKEND_APP).post('/admin/api/instances/watchdog').send({}).expect(401);
  });

  it('should reject an invalid body', async () => {
    await adminRequest('post', '/admin/api/instances/watchdog').send({ execute: 'maybe' }).expect(422);
  });

  it('should report an offline instance without listing it when the account did not opt in', async () => {
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const response = await runWatchdog({});
    expect(response.body).to.deep.include({
      execute: false,
      total: 1,
      connected: 0,
      offline: 1,
      alerts: 0,
      back_online: 0,
      waiting: 0,
      errors: 0,
    });
    expect(response.body.instances).to.deep.equal([]);
  });

  it('should ignore the instances of the accounts without access to Gladys Plus', async () => {
    await enableAlert({ status: 'canceled' });
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 0, offline: 0, alerts: 0 });
    const account = await getAccount();
    expect(account.instance_offline_alert_sent_at).to.equal(null);
  });

  it('should ignore the secondary and deleted instances', async () => {
    await enableAlert();
    await TEST_DATABASE_INSTANCE.t_instance.update(
      { id: INSTANCE_ID },
      { last_seen_at: minutesAgo(120), primary_instance: false },
    );
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 0, alerts: 0 });
  });

  it('should not alert for an instance never seen', async () => {
    await enableAlert();
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 1, offline: 1, alerts: 0 });
    expect(response.body.instances).to.have.lengthOf(1);
    expect(response.body.instances[0]).to.deep.include({
      id: INSTANCE_ID,
      account_id: ACCOUNT_ID,
      connected: false,
      last_seen_at: null,
      offline_for_in_minutes: null,
      enabled: true,
      delay_in_minutes: 60,
      action: 'never_seen',
    });
    const account = await getAccount();
    expect(account.instance_offline_alert_sent_at).to.equal(null);
  });

  it('should wait until the delay of the account has elapsed', async () => {
    await enableAlert();
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(30) });
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 1, offline: 1, alerts: 0, waiting: 1 });
    expect(response.body.instances[0]).to.include({ offline_for_in_minutes: 30, action: 'wait' });
    const account = await getAccount();
    expect(account.instance_offline_alert_sent_at).to.equal(null);
  });

  it('should only report the alert to send without execute', async () => {
    await enableAlert();
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const response = await runWatchdog({});
    expect(response.body).to.deep.include({ execute: false, total: 1, offline: 1, alerts: 1 });
    expect(response.body.instances[0]).to.include({ action: 'alert' });
    // the confirmed admins of the account are the recipients, the unconfirmed one is not
    expect(recipientIds(response.body.instances[0])).to.deep.equal(CONFIRMED_ADMIN_IDS);
    expect(recipientIds(response.body.instances[0])).to.not.include(UNCONFIRMED_ADMIN_ID);
    const account = await getAccount();
    expect(account.instance_offline_alert_sent_at).to.equal(null);
  });

  it('should alert the confirmed admins of the account once per outage', async () => {
    await enableAlert({ instance_offline_alert_delay_in_minutes: 60 });
    // a plain user of the account is not a recipient
    await TEST_DATABASE_INSTANCE.t_user.update({ id: OTHER_ADMIN_IDS[0] }, { role: 'user' });
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });

    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ execute: true, total: 1, offline: 1, alerts: 1, waiting: 0, errors: 0 });
    expect(response.body.instances[0]).to.include({ action: 'alert', offline_for_in_minutes: 120 });
    expect(response.body.instances[0].recipients).to.have.deep.members([
      { id: ADMIN_ID, status: 'sent' },
      { id: OTHER_ADMIN_IDS[1], status: 'sent' },
    ]);
    const account = await getAccount();
    expect(new Date(account.instance_offline_alert_sent_at).getTime()).to.be.closeTo(Date.now(), 10000);
    // the instance is still offline: nothing is written about it
    const instance = await getInstance();
    expect(new Date(instance.last_seen_at).getTime()).to.be.closeTo(minutesAgo(120).getTime(), 10000);

    // second run: the account is not emailed again
    const secondResponse = await runWatchdog({ execute: true });
    expect(secondResponse.body).to.deep.include({ alerts: 0 });
    expect(secondResponse.body.instances[0]).to.include({ action: 'already_alerted' });
  });

  it('should report an offline instance whose account has no confirmed admin', async () => {
    await enableAlert();
    await TEST_DATABASE_INSTANCE.t_user.update({ account_id: ACCOUNT_ID }, { email_confirmed: false });
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 1, offline: 1, alerts: 0, errors: 0 });
    expect(response.body.instances[0]).to.deep.include({ action: 'no_recipient', recipients: [] });
    const account = await getAccount();
    expect(account.instance_offline_alert_sent_at).to.equal(null);
  });

  it('should see the instance connected on the other node and refresh its last_seen_at', async () => {
    await enableAlert();
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const socket = await connectInstance(process.env.SERVER_PORT + 1);
    try {
      const response = await runWatchdog({ execute: true });
      expect(response.body).to.deep.include({ total: 1, connected: 1, offline: 0, alerts: 0, back_online: 0 });
      // a connected instance with nothing to report is not listed
      expect(response.body.instances).to.deep.equal([]);
      const instance = await getInstance();
      expect(new Date(instance.last_seen_at).getTime()).to.be.closeTo(Date.now(), 10000);
      const account = await getAccount();
      expect(account.instance_offline_alert_sent_at).to.equal(null);
    } finally {
      socket.disconnect();
    }
  });

  it('should not refresh last_seen_at without execute', async () => {
    const socket = await connectInstance();
    try {
      const response = await runWatchdog({});
      expect(response.body).to.deep.include({ total: 1, connected: 1, offline: 0 });
      const instance = await getInstance();
      expect(instance.last_seen_at).to.equal(null);
    } finally {
      socket.disconnect();
    }
  });

  it('should send the back online email once the instance is connected again, even if disabled since', async () => {
    // the alert was disabled after being sent: the outage is still closed for the admins
    await enableAlert({ instance_offline_alert_enabled: false, instance_offline_alert_sent_at: minutesAgo(60) });
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const socket = await connectInstance();
    try {
      const response = await runWatchdog({ execute: true });
      expect(response.body).to.deep.include({ total: 1, connected: 1, offline: 0, alerts: 0, back_online: 1 });
      expect(response.body.instances).to.have.lengthOf(1);
      expect(response.body.instances[0]).to.deep.include({
        id: INSTANCE_ID,
        connected: true,
        offline_for_in_minutes: null,
        action: 'back_online',
      });
      expect(recipientIds(response.body.instances[0])).to.deep.equal(CONFIRMED_ADMIN_IDS);
      const account = await getAccount();
      expect(account.instance_offline_alert_sent_at).to.equal(null);
      const instance = await getInstance();
      expect(new Date(instance.last_seen_at).getTime()).to.be.closeTo(Date.now(), 10000);

      // the outage is closed: a new one can be reported later
      const secondResponse = await runWatchdog({ execute: true });
      expect(secondResponse.body).to.deep.include({ connected: 1, back_online: 0 });
      expect(secondResponse.body.instances).to.deep.equal([]);
    } finally {
      socket.disconnect();
    }
  });

  it('should keep an open outage as is while the instance is still offline', async () => {
    await enableAlert({ instance_offline_alert_sent_at: minutesAgo(60) });
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 1, offline: 1, alerts: 0, back_online: 0 });
    expect(response.body.instances[0]).to.include({ action: 'already_alerted' });
  });
});

describe('Instance websocket disconnection', () => {
  it('should record when the instance was last seen', async () => {
    const socket = await connectInstance();
    expect((await getInstance()).last_seen_at).to.equal(null);
    socket.disconnect();
    await waitFor(async () => (await getInstance()).last_seen_at !== null);
    const instance = await getInstance();
    expect(new Date(instance.last_seen_at).getTime()).to.be.closeTo(Date.now(), 5000);
  });
});
