const request = require('supertest');
const { expect } = require('chai');
const { io } = require('socket.io-client');
const Jwt = require('../../../../core/service/jwt');
const configTest = require('../../../tasks/config');

const INSTANCE_ID = '0bc53f3c-1e11-40d3-99a4-bd392a666eaf';
const ACCOUNT_ID = 'b2d23f66-487d-493f-8acb-9c8adb400def';
// email confirmed users of the account
const USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
const OTHER_USER_ID = 'bdb1a902-a65e-46f9-8c2a-5c09840e2e10';

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

function subscribeUser(userId, values = {}) {
  return TEST_DATABASE_INSTANCE.t_user.update(
    { id: userId },
    { instance_offline_alert_enabled: true, instance_offline_alert_delay_in_minutes: 60, ...values },
  );
}

function getUser(userId) {
  return TEST_DATABASE_INSTANCE.t_user.findOne({ id: userId });
}

function getInstance() {
  return TEST_DATABASE_INSTANCE.t_instance.findOne({ id: INSTANCE_ID });
}

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

describe('Instance watchdog settings (GET / PATCH /users/me)', () => {
  it('should be disabled by default with a delay of one hour', async () => {
    const response = await request(TEST_BACKEND_APP)
      .get('/users/me')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body).to.include({
      instance_offline_alert_enabled: false,
      instance_offline_alert_delay_in_minutes: 60,
    });
  });

  it('should enable the alerts with a custom delay', async () => {
    const response = await request(TEST_BACKEND_APP)
      .patch('/users/me')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({ instance_offline_alert_enabled: true, instance_offline_alert_delay_in_minutes: 30 })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.include({
      instance_offline_alert_enabled: true,
      instance_offline_alert_delay_in_minutes: 30,
    });
    const user = await getUser(USER_ID);
    expect(user).to.include({ instance_offline_alert_enabled: true, instance_offline_alert_delay_in_minutes: 30 });
  });

  it('should refuse a delay shorter than 5 minutes or longer than 7 days', async () => {
    await request(TEST_BACKEND_APP)
      .patch('/users/me')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({ instance_offline_alert_delay_in_minutes: 1 })
      .expect(422);
    await request(TEST_BACKEND_APP)
      .patch('/users/me')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({ instance_offline_alert_delay_in_minutes: 8 * 24 * 60 })
      .expect(422);
    const user = await getUser(USER_ID);
    expect(user).to.include({ instance_offline_alert_enabled: false, instance_offline_alert_delay_in_minutes: 60 });
  });
});

describe('POST /admin/api/instances/watchdog', () => {
  it('should require the admin API key', async () => {
    await request(TEST_BACKEND_APP).post('/admin/api/instances/watchdog').send({}).expect(401);
  });

  it('should reject an invalid body', async () => {
    await adminRequest('post', '/admin/api/instances/watchdog').send({ execute: 'maybe' }).expect(422);
  });

  it('should report an offline instance without listing it when nobody opted in', async () => {
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
    await TEST_DATABASE_INSTANCE.t_account.update({ id: ACCOUNT_ID }, { status: 'canceled' });
    await subscribeUser(USER_ID);
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 0, offline: 0, alerts: 0 });
    const user = await getUser(USER_ID);
    expect(user.instance_offline_alert_sent_at).to.equal(null);
  });

  it('should ignore the secondary and deleted instances', async () => {
    await subscribeUser(USER_ID);
    await TEST_DATABASE_INSTANCE.t_instance.update(
      { id: INSTANCE_ID },
      { last_seen_at: minutesAgo(120), primary_instance: false },
    );
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 0, alerts: 0 });
  });

  it('should not alert for an instance never seen', async () => {
    await subscribeUser(USER_ID);
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 1, offline: 1, alerts: 0 });
    expect(response.body.instances).to.have.lengthOf(1);
    expect(response.body.instances[0]).to.deep.include({
      id: INSTANCE_ID,
      connected: false,
      last_seen_at: null,
      offline_for_in_minutes: null,
    });
    expect(response.body.instances[0].users).to.deep.equal([
      { id: USER_ID, delay_in_minutes: 60, action: 'never_seen' },
    ]);
    const user = await getUser(USER_ID);
    expect(user.instance_offline_alert_sent_at).to.equal(null);
  });

  it('should wait until the delay of the user has elapsed', async () => {
    await subscribeUser(USER_ID);
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(30) });
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 1, offline: 1, alerts: 0, waiting: 1 });
    expect(response.body.instances[0]).to.include({ offline_for_in_minutes: 30 });
    expect(response.body.instances[0].users).to.deep.equal([{ id: USER_ID, delay_in_minutes: 60, action: 'wait' }]);
    const user = await getUser(USER_ID);
    expect(user.instance_offline_alert_sent_at).to.equal(null);
  });

  it('should only report the alert to send without execute', async () => {
    await subscribeUser(USER_ID);
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const response = await runWatchdog({});
    expect(response.body).to.deep.include({ execute: false, total: 1, offline: 1, alerts: 1 });
    expect(response.body.instances[0].users).to.deep.equal([{ id: USER_ID, delay_in_minutes: 60, action: 'alert' }]);
    const user = await getUser(USER_ID);
    expect(user.instance_offline_alert_sent_at).to.equal(null);
  });

  it('should alert each user according to his own delay, once per outage', async () => {
    await subscribeUser(USER_ID, { instance_offline_alert_delay_in_minutes: 60 });
    await subscribeUser(OTHER_USER_ID, { instance_offline_alert_delay_in_minutes: 180 });
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });

    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ execute: true, total: 1, offline: 1, alerts: 1, waiting: 1, errors: 0 });
    // users are listed in a stable order (creation date, then id)
    expect(response.body.instances[0].users).to.deep.equal([
      { id: USER_ID, delay_in_minutes: 60, action: 'alert' },
      { id: OTHER_USER_ID, delay_in_minutes: 180, action: 'wait' },
    ]);
    const user = await getUser(USER_ID);
    expect(new Date(user.instance_offline_alert_sent_at).getTime()).to.be.closeTo(Date.now(), 10000);
    const otherUser = await getUser(OTHER_USER_ID);
    expect(otherUser.instance_offline_alert_sent_at).to.equal(null);
    // the instance is still offline: nothing is written about it
    const instance = await getInstance();
    expect(new Date(instance.last_seen_at).getTime()).to.be.closeTo(minutesAgo(120).getTime(), 10000);

    // second run: the alerted user is not emailed again
    const secondResponse = await runWatchdog({ execute: true });
    expect(secondResponse.body).to.deep.include({ alerts: 0, waiting: 1 });
    expect(secondResponse.body.instances[0].users).to.deep.equal([
      { id: USER_ID, delay_in_minutes: 60, action: 'already_alerted' },
      { id: OTHER_USER_ID, delay_in_minutes: 180, action: 'wait' },
    ]);
  });

  it('should not alert a user whose email is not confirmed', async () => {
    // tony.stark@gladysassistant.com has not confirmed his email
    await subscribeUser('29770e0d-26a9-444e-91a1-f175c99a5218');
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 1, offline: 1, alerts: 0 });
    expect(response.body.instances).to.deep.equal([]);
  });

  it('should see the instance connected on the other node and refresh its last_seen_at', async () => {
    await subscribeUser(USER_ID);
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const socket = await connectInstance(process.env.SERVER_PORT + 1);
    try {
      const response = await runWatchdog({ execute: true });
      expect(response.body).to.deep.include({ total: 1, connected: 1, offline: 0, alerts: 0, back_online: 0 });
      // a connected instance with nothing to report is not listed
      expect(response.body.instances).to.deep.equal([]);
      const instance = await getInstance();
      expect(new Date(instance.last_seen_at).getTime()).to.be.closeTo(Date.now(), 10000);
      const user = await getUser(USER_ID);
      expect(user.instance_offline_alert_sent_at).to.equal(null);
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

  it('should send the back online email once the instance is connected again', async () => {
    const alertSentAt = minutesAgo(60);
    await subscribeUser(USER_ID, { instance_offline_alert_sent_at: alertSentAt });
    // this user opted out after being alerted: the outage is still closed for him
    await TEST_DATABASE_INSTANCE.t_user.update(
      { id: OTHER_USER_ID },
      { instance_offline_alert_enabled: false, instance_offline_alert_sent_at: alertSentAt },
    );
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const socket = await connectInstance();
    try {
      const response = await runWatchdog({ execute: true });
      expect(response.body).to.deep.include({ total: 1, connected: 1, offline: 0, alerts: 0, back_online: 2 });
      expect(response.body.instances).to.have.lengthOf(1);
      expect(response.body.instances[0]).to.deep.include({
        id: INSTANCE_ID,
        connected: true,
        offline_for_in_minutes: null,
      });
      expect(response.body.instances[0].users).to.deep.equal([
        { id: USER_ID, delay_in_minutes: 60, action: 'back_online' },
        { id: OTHER_USER_ID, delay_in_minutes: 60, action: 'back_online' },
      ]);
      const user = await getUser(USER_ID);
      expect(user.instance_offline_alert_sent_at).to.equal(null);
      const otherUser = await getUser(OTHER_USER_ID);
      expect(otherUser.instance_offline_alert_sent_at).to.equal(null);
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

  it('should keep an open outage as is while the instance is still offline, even if the user opted out', async () => {
    await TEST_DATABASE_INSTANCE.t_user.update(
      { id: USER_ID },
      { instance_offline_alert_enabled: false, instance_offline_alert_sent_at: minutesAgo(60) },
    );
    await TEST_DATABASE_INSTANCE.t_instance.update({ id: INSTANCE_ID }, { last_seen_at: minutesAgo(120) });
    const response = await runWatchdog({ execute: true });
    expect(response.body).to.deep.include({ total: 1, offline: 1, alerts: 0, back_online: 0 });
    expect(response.body.instances[0].users).to.deep.equal([
      { id: USER_ID, delay_in_minutes: 60, action: 'already_alerted' },
    ]);
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
