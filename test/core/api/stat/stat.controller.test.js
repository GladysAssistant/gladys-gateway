const request = require('supertest');
const { expect } = require('chai');

describe('GET /stats', () => {
  it('should return stats', () =>
    request(TEST_BACKEND_APP)
      .get('/stats')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        expect(response.body).to.have.property('gladys_4_instances');
        expect(response.body).to.have.property('nb_gladys_plus_users', 0);
        expect(response.body.gladys_4_instances).to.be.instanceOf(Array);
        response.body.gladys_4_instances.forEach((month) => {
          expect(month).to.have.property('nb_instances');
          expect(month).to.have.property('month');
        });
      }));
  it('should count an active account with a Stripe subscription as paying user', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: 'b2d23f66-487d-493f-8acb-9c8adb400def' },
      { stripe_customer_id: 'cus_paying', stripe_subscription_id: 'sub_paying' },
    );
    const response = await request(TEST_BACKEND_APP).get('/stats').expect(200);
    expect(response.body).to.have.property('nb_gladys_plus_users', 1);
  });
  it('should not count internal accounts as paying users', async () => {
    await TEST_DATABASE_INSTANCE.t_account.update(
      { id: 'b2d23f66-487d-493f-8acb-9c8adb400def' },
      { stripe_customer_id: 'cus_paying', stripe_subscription_id: 'sub_paying', is_internal: true },
    );
    const response = await request(TEST_BACKEND_APP).get('/stats').expect(200);
    expect(response.body).to.have.property('nb_gladys_plus_users', 0);
  });
  it('should return stats a second time', () =>
    request(TEST_BACKEND_APP)
      .get('/stats')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        expect(response.body).to.have.property('gladys_4_instances');
        expect(response.body).to.have.property('nb_gladys_plus_users', 0);
        expect(response.body.gladys_4_instances).to.be.instanceOf(Array);
        response.body.gladys_4_instances.forEach((month) => {
          expect(month).to.have.property('nb_instances');
          expect(month).to.have.property('month');
        });
      }));
});

describe('stats of the Gladys 4 instances', () => {
  const CLIENT_A = '6d5a2c1c-3c0e-4f43-9f43-6ac5c1f3b0a1';
  const CLIENT_B = '0b8bd5d0-6a6b-4f39-8c63-1f6b7e1b9b02';
  const CLIENT_C = 'b6a3a1e2-2b4a-4b2e-9a51-5b3f1c6d7e03';
  // The dates are computed by the database, in its timezone, like the stats themselves
  const OLDEST_MONTH_START = "date_trunc('month', CURRENT_DATE) - INTERVAL '6 months'";

  async function insertUsagePoint(clientId, createdAtSql) {
    await TEST_DATABASE_INSTANCE.query(
      `INSERT INTO t_gladys_usage (client_id, event_type, created_at) VALUES ($1, 'get-gladys-version', ${createdAtSql})`,
      [clientId],
    );
  }

  async function getMonths() {
    const [{ oldest, current }] = await TEST_DATABASE_INSTANCE.query(
      `SELECT to_char(${OLDEST_MONTH_START}, 'YYYY-MM') AS oldest, to_char(CURRENT_DATE, 'YYYY-MM') AS current`,
    );
    return { oldest, current };
  }

  it('should count the distinct instances per month over the last 6 whole months', async () => {
    // the oldest month is counted from its first day (it used to start 6 months ago to the day)
    await insertUsagePoint(CLIENT_A, `${OLDEST_MONTH_START} + INTERVAL '1 hour'`);
    await insertUsagePoint(CLIENT_A, `${OLDEST_MONTH_START} + INTERVAL '2 days'`);
    await insertUsagePoint(CLIENT_B, `${OLDEST_MONTH_START} + INTERVAL '1 day'`);
    // before the period
    await insertUsagePoint(CLIENT_C, `${OLDEST_MONTH_START} - INTERVAL '1 second'`);
    // the current month: the fixture instance, CLIENT_A, and a usage point without instance
    await insertUsagePoint(CLIENT_A, 'now()');
    await insertUsagePoint(null, 'now()');
    const { oldest, current } = await getMonths();
    const stats = await TEST_MODELS.statModel.refreshNumberOfGladys4Instances();
    expect(stats).to.deep.equal([
      { nb_instances: '2', month: oldest },
      { nb_instances: '2', month: current },
    ]);
  });

  it('should serve GET /stats from the cache refreshed by the scheduler', async () => {
    const { current } = await getMonths();
    await TEST_MODELS.statModel.refreshNumberOfGladys4Instances();
    const ttl = await TEST_REDIS_CLIENT.ttl('stats:gladys-4-instances');
    expect(ttl).to.be.within(3 * 60 * 60 - 10, 3 * 60 * 60);
    // a new instance is only counted at the next refresh
    await insertUsagePoint(CLIENT_A, 'now()');
    const response = await request(TEST_BACKEND_APP).get('/stats').expect(200);
    expect(response.body.gladys_4_instances).to.deep.equal([{ nb_instances: '1', month: current }]);
    await TEST_MODELS.statModel.refreshNumberOfGladys4Instances();
    const refreshed = await request(TEST_BACKEND_APP).get('/stats').expect(200);
    expect(refreshed.body.gladys_4_instances).to.deep.equal([{ nb_instances: '2', month: current }]);
  });

  it('should compute the stats once for concurrent calls', async () => {
    const first = TEST_MODELS.statModel.refreshNumberOfGladys4Instances();
    const second = TEST_MODELS.statModel.refreshNumberOfGladys4Instances();
    expect(second).to.equal(first);
    await first;
    // a later call computes them again
    const third = TEST_MODELS.statModel.refreshNumberOfGladys4Instances();
    expect(third).to.not.equal(first);
    await third;
  });
});
