const request = require('supertest');
const assert = require('assert');
const { expect } = require('chai');

const PingController = require('../../../../core/api/ping/ping.controller');

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

  it('should return 503 without touching the database while the server is draining', async () => {
    let pinged = false;
    const pingModel = {
      ping: async () => {
        pinged = true;
      },
    };
    let draining = false;
    const controller = PingController(pingModel, { isDraining: () => draining });
    const fakeRes = () => {
      const res = { statusCode: 200 };
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (body) => {
        res.body = body;
        return res;
      };
      return res;
    };

    const healthy = fakeRes();
    await controller.ping({}, healthy);
    expect(healthy.statusCode).to.equal(200);
    expect(pinged).to.equal(true);

    pinged = false;
    draining = true;
    const drained = fakeRes();
    await controller.ping({}, drained);
    expect(drained.statusCode).to.equal(503);
    expect(drained.body).to.deep.equal({ status: 503, draining: true });
    expect(pinged).to.equal(false);
  });
});
