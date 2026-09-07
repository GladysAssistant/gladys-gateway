const request = require('supertest');
const { expect } = require('chai');

const EXISTING_VERSION_ID = '27672c3b-220b-4813-9488-2a9b0e8b8542';

function adminRequest(method, url, apiKey = process.env.ADMIN_API_AUTHORIZATION_TOKEN) {
  return request(TEST_BACKEND_APP)[method](url).set('Accept', 'application/json').set('X-Admin-Api-Key', apiKey);
}

async function getCurrentVersionSeenByGladys() {
  const response = await request(TEST_BACKEND_APP).get('/v1/api/gladys/version').expect(200);
  return response.body;
}

describe('GET /admin/api/gladys/versions', () => {
  it('should list all versions', async () => {
    await TEST_DATABASE_INSTANCE.t_gladys_version.insert({ name: 'v4.1.0', active: false });
    const response = await adminRequest('get', '/admin/api/gladys/versions').expect('Content-Type', /json/).expect(200);
    expect(response.body).to.have.lengthOf(2);
    // most recent first, inactive versions included
    expect(response.body[0]).to.include({ name: 'v4.1.0', active: false });
    expect(response.body[1]).to.include({
      id: EXISTING_VERSION_ID,
      name: 'v4.0.0-alpha',
      active: true,
      default_release_note_link: 'https://github.com/GladysAssistant/Gladys/releases/tag/v4.57.0',
    });
  });
});

describe('POST /admin/api/gladys/versions', () => {
  const newVersion = {
    name: 'v4.58.0',
    default_release_note_link: 'https://github.com/GladysAssistant/Gladys/releases/tag/v4.58.0',
    fr_release_note_link: 'https://gladysassistant.com/fr/blog/gladys-4-58',
  };

  it('should create an active version and make it the current one', async () => {
    const response = await adminRequest('post', '/admin/api/gladys/versions')
      .send(newVersion)
      .expect('Content-Type', /json/)
      .expect(201);
    expect(response.body).to.include({ ...newVersion, active: true });
    expect(response.body).to.have.property('id');
    const current = await getCurrentVersionSeenByGladys();
    expect(current).to.include(newVersion);
  });

  it('should create a version with the restricted version api key', async () => {
    const response = await adminRequest('post', '/admin/api/gladys/versions', process.env.GLADYS_VERSION_API_KEY)
      .send(newVersion)
      .expect(201);
    expect(response.body).to.include({ name: 'v4.58.0', active: true });
  });

  it('should create an inactive version without changing the current one', async () => {
    await adminRequest('post', '/admin/api/gladys/versions').send({ name: 'v4.59.0-beta', active: false }).expect(201);
    const current = await getCurrentVersionSeenByGladys();
    expect(current.name).to.equal('v4.0.0-alpha');
  });

  it('should return 409 when the version already exists', async () => {
    await adminRequest('post', '/admin/api/gladys/versions').send(newVersion).expect(201);
    const response = await adminRequest('post', '/admin/api/gladys/versions').send(newVersion).expect(409);
    expect(response.body).to.have.property('error_code', 'ALREADY_EXIST');
    const versions = await TEST_DATABASE_INSTANCE.t_gladys_version.find({ name: 'v4.58.0' });
    expect(versions).to.have.lengthOf(1);
  });

  it('should return 422 with an invalid name', async () => {
    await adminRequest('post', '/admin/api/gladys/versions').send({ name: 'latest' }).expect(422);
    await adminRequest('post', '/admin/api/gladys/versions').send({ name: 'v4.58' }).expect(422);
    await adminRequest('post', '/admin/api/gladys/versions').send({}).expect(422);
  });

  it('should return 422 with a non https release note link', async () => {
    const response = await adminRequest('post', '/admin/api/gladys/versions')
      .send({ name: 'v4.58.0', default_release_note_link: 'http://example.com' })
      .expect(422);
    expect(response.body).to.have.property('error_code', 'UNPROCESSABLE_ENTITY');
  });

  it('should return 401 without a valid key', async () => {
    await adminRequest('post', '/admin/api/gladys/versions', 'wrong-key').send(newVersion).expect(401);
    await request(TEST_BACKEND_APP).post('/admin/api/gladys/versions').send(newVersion).expect(401);
  });
});

describe('PATCH /admin/api/gladys/versions/:id', () => {
  it('should deactivate a version (rollback) so the previous one is served again', async () => {
    const created = await adminRequest('post', '/admin/api/gladys/versions').send({ name: 'v4.58.0' }).expect(201);
    expect((await getCurrentVersionSeenByGladys()).name).to.equal('v4.58.0');

    const response = await adminRequest('patch', `/admin/api/gladys/versions/${created.body.id}`)
      .send({ active: false })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.include({ id: created.body.id, name: 'v4.58.0', active: false });
    expect((await getCurrentVersionSeenByGladys()).name).to.equal('v4.0.0-alpha');
  });

  it('should update the release note links', async () => {
    const response = await adminRequest('patch', `/admin/api/gladys/versions/${EXISTING_VERSION_ID}`)
      .send({ fr_release_note_link: 'https://gladysassistant.com/fr/blog/new-link', default_release_note_link: null })
      .expect(200);
    expect(response.body).to.include({
      name: 'v4.0.0-alpha',
      active: true,
      fr_release_note_link: 'https://gladysassistant.com/fr/blog/new-link',
      default_release_note_link: null,
    });
  });

  it('should return 422 with an empty or invalid body', async () => {
    await adminRequest('patch', `/admin/api/gladys/versions/${EXISTING_VERSION_ID}`).send({}).expect(422);
    await adminRequest('patch', `/admin/api/gladys/versions/${EXISTING_VERSION_ID}`)
      .send({ active: 'maybe' })
      .expect(422);
    // the name cannot be changed
    await adminRequest('patch', `/admin/api/gladys/versions/${EXISTING_VERSION_ID}`)
      .send({ name: 'v9.9.9' })
      .expect(422);
  });

  it('should return 404 for an unknown version', async () => {
    await adminRequest('patch', '/admin/api/gladys/versions/6b0e4a2e-6fd1-4bc5-9b73-8bd6a1a4f4d1')
      .send({ active: false })
      .expect(404);
    await adminRequest('patch', '/admin/api/gladys/versions/not-an-uuid').send({ active: false }).expect(404);
  });

  it('should refuse the restricted version api key', async () => {
    await adminRequest('patch', `/admin/api/gladys/versions/${EXISTING_VERSION_ID}`, process.env.GLADYS_VERSION_API_KEY)
      .send({ active: false })
      .expect(401);
  });
});
