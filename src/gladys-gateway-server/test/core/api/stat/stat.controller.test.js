const request = require('supertest');

describe('GET /stats', () => {
  it('should return stats', () =>
    request(TEST_BACKEND_APP)
      .get('/stats')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('gladys_4_instances');
        response.body.gladys_4_instances.should.be.instanceOf(Array);
        response.body.gladys_4_instances.forEach((month) => {
          month.should.have.property('nb_instances');
          month.should.have.property('month');
        });
      }));
  it('should return stats a second time', () =>
    request(TEST_BACKEND_APP)
      .get('/stats')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('gladys_4_instances');
        response.body.gladys_4_instances.should.be.instanceOf(Array);
        response.body.gladys_4_instances.forEach((month) => {
          month.should.have.property('nb_instances');
          month.should.have.property('month');
        });
      }));
});
