const request = require('supertest');
const configTest = require('../../../tasks/config');

describe('POST /v1/api/event/:open-api-key', () => {
  it('should refuse access, invalid API key', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/event/wrong-api-key')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(401));

  it('should return 404 instance not found', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/event/01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(404));
});

describe('POST /v1/api/message/:open-api-key', () => {
  it('should refuse access, invalid API key', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/message/wrong-api-key')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(401));

  it('should return 404 instance not found', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/message/01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(404));
});

describe('POST /v1/api/netatmo/:open-api-key', () => {
  it('should refuse access, invalid API key', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/netatmo/wrong-api-key')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(401));

  it('should return 404 instance not found', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/netatmo/01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(404));
});

describe('POST /v1/api/device/state/:open-api-key', () => {
  it('should refuse access, invalid API key', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/device/state/wrong-api-key')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(401));

  it('should return 404 instance not found', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/device/state/01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(404));
});
