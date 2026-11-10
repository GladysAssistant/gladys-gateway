const { expect } = require('chai');
const nock = require('nock');
const AlexaModel = require('../../../../core/api/alexa/alexa.model');
const { setupPersistentNocks } = require('../../../tasks/nock');

const INSTANCE_ID = '0bc53f3c-1e11-40d3-99a4-bd392a666eaf';
const DEVICE_ID = '6f3c1b7e-2d4a-4c8e-9b1f-0a5d7e3c2b19';
const USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';

const EU = 'https://api.eu.amazonalexa.com';
const NA = 'https://api.amazonalexa.com';
const FE = 'https://api.fe.amazonalexa.com';

const WRONG_REGION_BODY = {
  header: { namespace: 'System', name: 'Exception' },
  payload: { code: 'SKILL_NEVER_ENABLED_EXCEPTION', description: 'Skill was never enabled' },
};

// Unit tests of the choice of the Alexa Event Gateway region, with a fake database and
// Redis (the report state route is covered end to end in alexa.controller.test.js)
describe('alexa model reportState regions', () => {
  let redisStore;
  let warnings;
  let alexaModel;

  beforeEach(() => {
    redisStore = new Map();
    // the access token of the device is cached, no LWA call is made
    redisStore.set(`alexa-grant-access-token:${DEVICE_ID}`, 'access-token');
    warnings = [];
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (message) => warnings.push(message),
    };
    const redisClient = {
      get: async (key) => (redisStore.has(key) ? redisStore.get(key) : null),
      set: async (key, value) => {
        redisStore.set(key, value);
      },
    };
    const db = {
      query: async () => [
        { id: USER_ID, account_id: 'account', device_id: DEVICE_ID, provider_refresh_token: 'refresh-token' },
      ],
    };
    alexaModel = AlexaModel(logger, db, redisClient, {});
  });

  // an interceptor left unused must not leak into the next tests; cleanAll() also wipes
  // the persistent global nocks, which are set up again
  afterEach(() => {
    nock.cleanAll();
    setupPersistentNocks();
  });

  function mockEvent(host, status, body = {}) {
    return nock(host)
      .post('/v3/events', (payload) => payload.test_data === true)
      .matchHeader('authorization', 'Bearer access-token')
      .reply(status, body);
  }

  it('should send to Europe first and remember it', async () => {
    const eu = mockEvent(EU, 202);
    await alexaModel.reportState(INSTANCE_ID, { test_data: true });
    expect(eu.isDone()).to.equal(true);
    expect(redisStore.get(`alexa-event-gateway-region:${DEVICE_ID}`)).to.equal('eu');
    expect(warnings).to.deep.equal([]);
  });

  it('should try the next region when the customer is in another region, and remember it', async () => {
    const eu = mockEvent(EU, 403, WRONG_REGION_BODY);
    const na = mockEvent(NA, 202);
    await alexaModel.reportState(INSTANCE_ID, { test_data: true });
    expect(eu.isDone()).to.equal(true);
    expect(na.isDone()).to.equal(true);
    expect(redisStore.get(`alexa-event-gateway-region:${DEVICE_ID}`)).to.equal('na');
    expect(warnings).to.deep.equal([]);

    // the next event goes straight to North America
    const naAgain = mockEvent(NA, 202);
    await alexaModel.reportState(INSTANCE_ID, { test_data: true });
    expect(naAgain.isDone()).to.equal(true);
    expect(warnings).to.deep.equal([]);
  });

  it('should reach the Far East region', async () => {
    mockEvent(EU, 403, WRONG_REGION_BODY);
    mockEvent(NA, 403, WRONG_REGION_BODY);
    const fe = mockEvent(FE, 202);
    await alexaModel.reportState(INSTANCE_ID, { test_data: true });
    expect(fe.isDone()).to.equal(true);
    expect(redisStore.get(`alexa-event-gateway-region:${DEVICE_ID}`)).to.equal('fe');
  });

  it('should only try the known region of the device', async () => {
    redisStore.set(`alexa-event-gateway-region:${DEVICE_ID}`, 'fe');
    const fe = mockEvent(FE, 403, WRONG_REGION_BODY);
    await alexaModel.reportState(INSTANCE_ID, { test_data: true });
    expect(fe.isDone()).to.equal(true);
    expect(redisStore.get(`alexa-event-gateway-region:${DEVICE_ID}`)).to.equal('fe');
    expect(warnings).to.have.lengthOf(1);
    expect(warnings[0]).to.contain('status=403');
  });

  it('should not try another region on another error', async () => {
    const eu = mockEvent(EU, 403, {
      payload: { code: 'SKILL_DISABLED_EXCEPTION', description: 'Skill is disabled' },
    });
    const na = mockEvent(NA, 202);
    await alexaModel.reportState(INSTANCE_ID, { test_data: true });
    expect(eu.isDone()).to.equal(true);
    expect(na.isDone()).to.equal(false);
    expect(redisStore.has(`alexa-event-gateway-region:${DEVICE_ID}`)).to.equal(false);
    expect(warnings).to.have.lengthOf(1);
    expect(warnings[0]).to.contain('Skill is disabled');
  });

  it('should log an error and remember nothing when no region accepts the event', async () => {
    mockEvent(EU, 403, WRONG_REGION_BODY);
    mockEvent(NA, 403, WRONG_REGION_BODY);
    const fe = mockEvent(FE, 403, WRONG_REGION_BODY);
    await alexaModel.reportState(INSTANCE_ID, { test_data: true });
    expect(fe.isDone()).to.equal(true);
    expect(redisStore.has(`alexa-event-gateway-region:${DEVICE_ID}`)).to.equal(false);
    expect(warnings).to.have.lengthOf(1);
    expect(warnings[0]).to.contain('Skill was never enabled');
  });
});
