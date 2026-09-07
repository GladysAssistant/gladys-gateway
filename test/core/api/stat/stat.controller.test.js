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
