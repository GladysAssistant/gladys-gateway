const request = require('supertest');
const { expect } = require('chai');
const configTest = require('../../../tasks/config');

describe('GET /enedis/sync', () => {
  beforeEach(async () => {
    await TEST_DATABASE_INSTANCE.t_enedis_usage_point.insert({
      account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      usage_point_id: '16401220101758',
    });
    await TEST_DATABASE_INSTANCE.t_enedis_sync.insert({
      id: '4c9f5146-d913-481b-bfaa-ba874eb0c9be',
      usage_point_id: '16401220101758',
      jobs_done: 0,
      jobs_total: 200,
      created_at: '2022-11-25T05:32:33.336Z',
      updated_at: '2022-11-25T05:32:33.336Z',
    });
  });
  it('should return all sync from account', async () => {
    const response = await request(TEST_BACKEND_APP)
      .get('/enedis/sync')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal([
      {
        id: '4c9f5146-d913-481b-bfaa-ba874eb0c9be',
        usage_point_id: '16401220101758',
        jobs_done: 0,
        jobs_total: 200,
        created_at: '2022-11-25T05:32:33.336Z',
        updated_at: '2022-11-25T05:32:33.336Z',
      },
    ]);
  });
});
