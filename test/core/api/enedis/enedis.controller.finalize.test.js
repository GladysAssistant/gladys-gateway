const request = require('supertest');
const { expect } = require('chai');
const nock = require('nock');
const configTest = require('../../../tasks/config');
const { mockAccessTokenRefresh } = require('../../enedis/utils.test');

describe('POST /enedis/finalize', () => {
  it('should save refresh token in DB and return list of usage_points_id', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        code: 'someAuthCode',
        usage_points_id: ['16401220101758', '16401220101710', '16401220101720'],
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({
      usage_points_id: ['16401220101758', '16401220101710', '16401220101720'],
    });
  });
  it('should exchange autorisation_id for usage_points_id and return them (new DataConnect 2026 flow)', async () => {
    mockAccessTokenRefresh();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/subscribed_services/v1', (body) => {
        const autorisationIdValid = body.autorisationId === 'someAutorisationId';
        const serviceTypeValid = body.serviceType === 'ACCES';
        return autorisationIdValid && serviceTypeValid;
      })
      .reply(200, {
        nbTotalServices: 2,
        services: [
          {
            id: 1,
            pointId: '16401220101758',
            serviceCode: 'ACCES',
            etatCode: 'ACTIF',
            soutirage: true,
            injection: false,
            mesuresTypeCode: 'ENERGIE',
          },
          {
            id: 2,
            pointId: '16401220101758',
            serviceCode: 'ACCES',
            etatCode: 'ACTIF',
            soutirage: true,
            injection: false,
            mesuresTypeCode: 'CDC',
          },
        ],
      });
    const response = await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        autorisation_id: 'someAutorisationId',
        state: 'someState',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({
      usage_points_id: ['16401220101758'],
    });
    // The customer consents for a second meter: the new flow only allows one PRM
    // per consent, so finalize must return all the usage points of the account
    mockAccessTokenRefresh();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/subscribed_services/v1', (body) => body.autorisationId === 'someOtherAutorisationId')
      .reply(200, {
        nbTotalServices: 1,
        services: [
          {
            id: 3,
            pointId: '16401220101710',
            serviceCode: 'ACCES',
            etatCode: 'ACTIF',
            soutirage: true,
            injection: false,
            mesuresTypeCode: 'ENERGIE',
          },
        ],
      });
    const secondResponse = await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        autorisation_id: 'someOtherAutorisationId',
        state: 'someOtherState',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(secondResponse.body.usage_points_id).to.have.members(['16401220101758', '16401220101710']);
  });
  it('should handle a subscribed services response returned as a bare array', async () => {
    mockAccessTokenRefresh();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/subscribed_services/v1', (body) => body.autorisationId === 'bareArrayAutorisationId')
      .reply(200, [
        {
          id: 4,
          pointId: '16401220101720',
          serviceCode: 'ACCES',
          etatCode: 'ACTIF',
          soutirage: true,
          injection: false,
          mesuresTypeCode: 'ENERGIE',
        },
      ]);
    const response = await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        autorisation_id: 'bareArrayAutorisationId',
        state: 'someState',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body.usage_points_id).to.include('16401220101720');
  });
  it('should keep the previous Enedis connection when the exchange fails', async () => {
    // Link a first meter so the account has a working connection
    mockAccessTokenRefresh();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/subscribed_services/v1', (body) => body.autorisationId === 'workingAutorisationId')
      .reply(200, {
        services: [{ id: 5, pointId: '16401220101710', etatCode: 'ACTIF' }],
      });
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({ autorisation_id: 'workingAutorisationId', state: 'someState' })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);

    // A second consent whose exchange fails must not revoke that connection
    mockAccessTokenRefresh();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/subscribed_services/v1', (body) => body.autorisationId === 'failingAutorisationId')
      .reply(500);
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({ autorisation_id: 'failingAutorisationId', state: 'someState' })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(500);

    // The connection established by the first consent is still usable
    mockAccessTokenRefresh();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/subscribed_services/v1', (body) => body.autorisationId === 'afterFailureAutorisationId')
      .reply(200, {
        services: [{ id: 6, pointId: '16401220101720', etatCode: 'ACTIF' }],
      });
    const response = await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({ autorisation_id: 'afterFailureAutorisationId', state: 'someState' })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body.usage_points_id).to.include('16401220101720');
  });
  it('should fail when the subscribed services response is not a list', async () => {
    mockAccessTokenRefresh();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/subscribed_services/v1', (body) => body.autorisationId === 'notAListAutorisationId')
      .reply(200, {
        nbTotalServices: 1,
        services: { pointId: '16401220101758' },
      });
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        autorisation_id: 'notAListAutorisationId',
        state: 'someState',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(500);
  });
  it('should fail when the authorization resolves to no usage point', async () => {
    mockAccessTokenRefresh();
    nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
      .post('/subscribed_services/v1', (body) => body.autorisationId === 'emptyAutorisationId')
      .reply(200, {
        nbTotalServices: 0,
        services: [],
      });
    await request(TEST_BACKEND_APP)
      .post('/enedis/finalize')
      .send({
        autorisation_id: 'emptyAutorisationId',
        state: 'someState',
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(500);
  });
});
