const request = require('supertest');
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

describe('POST /accounts/subscribe/new', () => {
  it('should subscribe a new email to account', () => request(TEST_BACKEND_APP)
    .post('/accounts/subscribe/new')
    .send({
      email: 'tony.stark@gladysassistant.com',
      language: 'fr',
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

describe('POST /accounts/subscribe/new', () => {
  it('should return already exist error', () => request(TEST_BACKEND_APP)
    .post('/accounts/subscribe/new')
    .send({
      email: 'email-confirmed-two-factor-enabled@gladysprojet.com',
      language: 'fr',
      stripe_source_id: 'stripe-source-id-sample',
    })
    .set('Accept', 'application/json')
    .set('Authorization', configTest.jwtAccessTokenDashboard)
    .expect('Content-Type', /json/)
    .expect(409)
    .then((response) => {

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
      should.deepEqual(response.body, [{
        id: '88b4b295-deae-4452-a5f0-e67f18cf6abe',
        hosted_invoice_url: 'test',
        invoice_pdf: 'test',
        amount_paid: 999,
        created_at: '2018-10-16T02:21:25.901Z',
      }]);
    }));
});
