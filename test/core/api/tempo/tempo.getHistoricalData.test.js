const request = require('supertest');
const { expect } = require('chai');

describe('GET /edf/tempo/historical', () => {
  it('should return tempo data', async () => {
    await TEST_DATABASE_INSTANCE.t_tempo_historical_data.insert({
      created_at: '2024-09-02',
      day_type: 'blue',
    });
    await TEST_DATABASE_INSTANCE.t_tempo_historical_data.insert({
      created_at: '2024-09-03',
      day_type: 'white',
    });
    const response = await request(TEST_BACKEND_APP)
      .get('/edf/tempo/historical')
      .query({
        start_date: '2024-09-02',
        take: 20,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.headers).to.have.property('cache-control', 'public, max-age=3600');
    expect(response.body).to.deep.equal([
      {
        created_at: '2024-09-02',
        day_type: 'blue',
      },
      {
        created_at: '2024-09-03',
        day_type: 'white',
      },
    ]);
  });
});
