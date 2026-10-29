const request = require('supertest');

describe('Strict-Transport-Security header', () => {
  it('should be sent on every response', async () => {
    await request(TEST_BACKEND_APP).get('/ping').expect('Strict-Transport-Security', 'max-age=31536000').expect(200);
    await request(TEST_BACKEND_APP)
      .get('/this-route-does-not-exist')
      .expect('Strict-Transport-Security', 'max-age=31536000');
  });
});
