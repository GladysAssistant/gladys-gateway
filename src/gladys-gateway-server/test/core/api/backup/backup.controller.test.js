const request = require('supertest');
const should = require('should');
const configTest = require('../../../tasks/config');

describe('GET /backups', () => {
  it('should return list of backups', () => request(TEST_BACKEND_APP)
    .get('/backups')
    .set('Accept', 'application/json')
    .set('Authorization', configTest.jwtAccessTokenInstance)
    .expect('Content-Type', /json/)
    .expect(200)
    .then((response) => {
      should.deepEqual(response.body, [
        {
          id: '74dc8d58-3997-484a-a791-53e5b07279d7',
          account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
          path: 'http://backup-url',
          size: 1000,
          created_at: '2018-10-16T02:21:25.901Z',
          updated_at: '2018-10-16T02:21:25.901Z',
          is_deleted: false,
        },
      ]);
    }));
});
