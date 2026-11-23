const request = require('supertest');
const { expect } = require('chai');

describe('GET/POST /v1/api/gladys/version', () => {
  it('should return status 200', () =>
    request(TEST_BACKEND_APP)
      .get('/v1/api/gladys/version')
      // supertest >= 4 no longer sends a default User-Agent, the usage middleware records it
      .set('user-agent', 'Gladys/v4.57.0')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        expect(res.body).to.deep.equal({
          name: 'v4.0.0-alpha',
          created_at: '2018-10-16T02:21:25.901Z',
          default_release_note_link: 'https://github.com/GladysAssistant/Gladys/releases/tag/v4.57.0',
          fr_release_note_link: 'https://github.com/GladysAssistant/Gladys/releases/tag/v4.57.0',
        });
      }));
  it('should return status 200', () =>
    request(TEST_BACKEND_APP)
      .post('/v1/api/gladys/version')
      // supertest >= 4 no longer sends a default User-Agent, the usage middleware records it
      .set('user-agent', 'Gladys/v4.57.0')
      .set('Accept', 'application/json')
      .send({
        is_docker: true,
        device_state_count: 10,
        node_version: 'v14.10.0',
        integrations: {
          zwave: true,
          zigbee: true,
        },
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        expect(res.body).to.deep.equal({
          name: 'v4.0.0-alpha',
          created_at: '2018-10-16T02:21:25.901Z',
          default_release_note_link: 'https://github.com/GladysAssistant/Gladys/releases/tag/v4.57.0',
          fr_release_note_link: 'https://github.com/GladysAssistant/Gladys/releases/tag/v4.57.0',
        });
      }));
});

describe('Current Gladys version cache', () => {
  const VersionModel = require('../../../../core/api/version/version.model'); // eslint-disable-line global-require

  it('should cache the current version for 5 minutes', async () => {
    await request(TEST_BACKEND_APP).get('/v1/api/gladys/version').expect(200);
    const versionInCache = JSON.parse(await TEST_REDIS_CLIENT.get('gladys-version:current'));
    expect(versionInCache).to.include({ name: 'v4.0.0-alpha' });
    expect(await TEST_REDIS_CLIENT.ttl('gladys-version:current')).to.be.within(290, 300);
    // a version changed in database by hand is seen when the cache expires
    await TEST_DATABASE_INSTANCE.t_gladys_version.insert({ name: 'v4.58.0', active: true });
    const res = await request(TEST_BACKEND_APP).get('/v1/api/gladys/version').expect(200);
    expect(res.body.name).to.equal('v4.0.0-alpha');
    await TEST_REDIS_CLIENT.del('gladys-version:current');
    const fresh = await request(TEST_BACKEND_APP).get('/v1/api/gladys/version').expect(200);
    expect(fresh.body.name).to.equal('v4.58.0');
  });

  it('should read the version in database when Redis fails', async () => {
    const warnings = [];
    const logger = { warn: (message) => warnings.push(message) };
    const brokenRedis = {
      isReady: true,
      get: async () => {
        throw new Error('redis down');
      },
      set: async () => {
        throw new Error('redis down');
      },
    };
    const versionModel = VersionModel(logger, TEST_DATABASE_INSTANCE, brokenRedis);
    const version = await versionModel.getCurrentVersion();
    expect(version).to.include({ name: 'v4.0.0-alpha' });
    expect(warnings[0]).to.equal('Unable to read the current Gladys version cache (redis down)');
  });
});
