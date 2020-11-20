const request = require('supertest');
const { expect } = require('chai');
const configTest = require('../../../tasks/config');

describe('GET /accounts/users', () => {
  it('should return all users in same account as me', () => request(TEST_BACKEND_APP)
    .get('/accounts/users')
    .set('Accept', 'application/json')
    .set('Authorization', configTest.jwtAccessTokenDashboard)
    .expect('Content-Type', /json/)
    .expect(200)
    .then((response) => {
      response.body.should.be.instanceOf(Array);
      response.body.forEach((user) => {
        user.should.have.property('email');
        user.should.have.property('is_invitation');
      });
    }));
});

describe('POST /accounts/subscribe', () => {
  it('should subscribe to monthly plan and return next expiration', () => request(TEST_BACKEND_APP)
    .post('/accounts/subscribe')
    .send({
      stripe_source_id: 'stripe-source-id-sample',
    })
    .set('Accept', 'application/json')
    .set('Authorization', configTest.jwtAccessTokenDashboard)
    .expect('Content-Type', /json/)
    .expect(200)
    .then((response) => {
      response.body.should.have.property('current_period_end');
    }));
});

describe('POST /accounts/users/:id/revoke', () => {
  it('should revoke a user', () => request(TEST_BACKEND_APP)
    .post('/accounts/users/3b69f1c5-d36c-419d-884c-50b9dd6e33e4/revoke')
    .set('Accept', 'application/json')
    .set('Authorization', configTest.jwtAccessTokenDashboard)
    .expect('Content-Type', /json/)
    .expect(200)
    .then((response) => {
      response.body.should.have.property('success', true);
    }));
});

describe('GET /accounts/invoices', () => {
  it('should return invoices', () => request(TEST_BACKEND_APP)
    .get('/accounts/invoices')
    .set('Accept', 'application/json')
    .set('Authorization', configTest.jwtAccessTokenDashboard)
    .expect('Content-Type', /json/)
    .expect(200)
    .then((response) => {
      should.deepEqual(response.body, [
        {
          id: '88b4b295-deae-4452-a5f0-e67f18cf6abe',
          hosted_invoice_url: 'test',
          invoice_pdf: 'test',
          amount_paid: 999,
          created_at: '2018-10-16T02:21:25.901Z',
        },
      ]);
    }));
});

describe('GET /accounts/stripe_customer_portal/:id', () => {
  it('should redirect to stripe customer portal', async () => {
    await request(TEST_BACKEND_APP)
      .get('/accounts/stripe_customer_portal/5959fcac-71b7-4a0e-8d67-5ab3f616f703')
      .expect(302)
      .then((response) => {
        expect(response.text).to.equal('Found. Redirecting to https://billing.stripe.com/session/SESSION_SECRET');
      });
  });
  it('should return 404 not found', async () => {
    await request(TEST_BACKEND_APP)
      .get('/accounts/stripe_customer_portal/a70ada04-3362-4e6f-b79f-c827d3604354')
      .expect(404);
  });
});
