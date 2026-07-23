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

  it('should return 404 when account has no primary instance', async () => {
    await TEST_DATABASE_INSTANCE.t_instance.update(
      { id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf' },
      { primary_instance: false },
    );
    return request(TEST_BACKEND_APP)
      .post('/v1/api/netatmo/01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(404);
  });
});

describe('POST /v1/api/external-integration/:open-api-key/:selector/:webhook-key', () => {
  it('should refuse access, invalid API key', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/external-integration/wrong-api-key/my-integration/events')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(401));

  it('should return 200 empty when instance is not connected', () =>
    request(TEST_BACKEND_APP)
      .post(
        '/v1/api/external-integration/01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db/my-integration/events',
      )
      .set('Accept', 'application/json')
      .send({ test: true })
      .expect(200)
      .then((response) => {
        response.text.should.equal('');
      }));

  it('should return 200 empty when account has no primary instance', async () => {
    await TEST_DATABASE_INSTANCE.t_instance.update(
      { id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf' },
      { primary_instance: false },
    );
    return request(TEST_BACKEND_APP)
      .post(
        '/v1/api/external-integration/01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db/my-integration/events',
      )
      .set('Accept', 'application/json')
      .send({ test: true })
      .expect(200)
      .then((response) => {
        response.text.should.equal('');
      });
  });
});

describe('GET /v1/api/external-integration/:open-api-key/:selector/:webhook-key', () => {
  it('should refuse access, invalid API key', () =>
    request(TEST_BACKEND_APP)
      .get('/v1/api/external-integration/wrong-api-key/my-integration/events')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(401));

  it('should return 200 empty when instance is not connected', () =>
    request(TEST_BACKEND_APP)
      .get(
        '/v1/api/external-integration/01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db/my-integration/events',
      )
      .set('Accept', 'application/json')
      .expect(200)
      .then((response) => {
        response.text.should.equal('');
      }));
});

describe('POST /v1/api/mcp/:open-api-key', () => {
  it('should refuse access, invalid API key', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/mcp/wrong-api-key')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(401));

  it('should return 404 instance not found', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/mcp/01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(404));
});

describe('GET /v1/api/mcp/:open-api-key', () => {
  it('should refuse access, invalid API key', () =>
    request(TEST_BACKEND_APP)
      .get('/v1/api/mcp/wrong-api-key')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(401));

  it('should return 404 instance not found', () =>
    request(TEST_BACKEND_APP)
      .get('/v1/api/mcp/01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(404));
});

describe('DELETE /v1/api/mcp/:open-api-key', () => {
  it('should refuse access, invalid API key', () =>
    request(TEST_BACKEND_APP)
      .delete('/v1/api/mcp/wrong-api-key')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(401));

  it('should return 404 instance not found', () =>
    request(TEST_BACKEND_APP)
      .delete('/v1/api/mcp/01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db')
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
