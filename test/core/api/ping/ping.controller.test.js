const request = require('supertest');
const assert = require('assert');

describe('GET /ping', () => {
  it('should return status 200', () =>
    request(TEST_BACKEND_APP)
      .get('/ping')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        assert(response.body.status, 200);
      }));
});
