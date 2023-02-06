const request = require('supertest');
const { expect } = require('chai');
const configTest = require('../../../tasks/config');

describe('Enedis.getConsumptionLoadCurve', () => {
  beforeEach(async () => {
    await TEST_DATABASE_INSTANCE.t_enedis_usage_point.insert({
      account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      usage_point_id: '16401220101758',
    });
    await TEST_DATABASE_INSTANCE.t_enedis_consumption_load_curve.insert([
      {
        usage_point_id: '16401220101758',
        value: 100,
        created_at: '2022-08-01 03:00:00',
      },
      {
        usage_point_id: '16401220101758',
        value: 101,
        created_at: '2022-08-01 04:00:00',
      },
      {
        usage_point_id: '16401220101758',
        value: 102,
        created_at: '2022-08-01 05:00:00',
      },
      {
        usage_point_id: '16401220101758',
        value: 103,
        created_at: '2022-08-01 06:00:00',
      },
    ]);
  });
  it('should return enedis data', async () => {
    const response = await request(TEST_BACKEND_APP)
      .get('/enedis/metering_data/consumption_load_curve')
      .query({ usage_point_id: '16401220101758', after: '2022-08-01 00:00:00', take: 3 })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal([
      {
        value: 100,
        created_at: '2022-08-01T03:00:00.000Z',
      },
      {
        value: 101,
        created_at: '2022-08-01T04:00:00.000Z',
      },
      {
        value: 102,
        created_at: '2022-08-01T05:00:00.000Z',
      },
    ]);
  });
  it('should return 422', async () => {
    const response = await request(TEST_BACKEND_APP)
      .get('/enedis/metering_data/consumption_load_curve')
      .query({ toto: 'toto' })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(422);
    expect(response.body).to.deep.equal({
      status: 422,
      error_code: 'UNPROCESSABLE_ENTITY',
      details: [
        {
          message: '"usage_point_id" is required',
          path: ['usage_point_id'],
          type: 'any.required',
          context: { key: 'usage_point_id', label: 'usage_point_id' },
        },
        {
          message: '"after" is required',
          path: ['after'],
          type: 'any.required',
          context: { key: 'after', label: 'after' },
        },
        {
          message: '"take" is required',
          path: ['take'],
          type: 'any.required',
          context: { key: 'take', label: 'take' },
        },
      ],
    });
  });
});
