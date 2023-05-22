const request = require('supertest');
const { promises: fs } = require('fs');
const path = require('path');
const redis = require('redis');
const { expect } = require('chai');

const configTest = require('../../../tasks/config');

const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PASSWORD,
});

describe('cameraController', () => {
  const filePath = path.join(__dirname, 'file_to_upload.txt');
  let file;
  before(async () => {
    await redisClient.connect();
    file = await fs.readFile(filePath);
  });
  it('should upload camera index file', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .post('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index.m3u8')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(file);
    expect(response.body).to.deep.equal({ success: true });
  });
  it('should upload large file', async function Test() {
    this.timeout(10000);
    const largeFilePath = path.join(__dirname, 'temp_10_mb');
    const largeFile = await fs.readFile(largeFilePath);
    const response = await request(TEST_BACKEND_APP)
      .post('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index19.ts')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(largeFile);
    expect(response.body).to.deep.equal({ success: true });
  });
  it('should return 429 too much camera traffic', async function Test() {
    this.timeout(10000);
    await redisClient.set(
      'rate_limit:camera_data_traffic:0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      50 * 1024 * 1024 * 1024,
    );
    const response = await request(TEST_BACKEND_APP)
      .post('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index.m3u8')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(file)
      .expect(429);
    expect(response.body).to.deep.equal({
      error_code: 'TOO_MANY_REQUESTS',
      error_message: 'Too much camera traffic used this month',
      status: 429,
    });
  });
  it('should not return 429 at first call, but will return 429 on second call', async function Test() {
    this.timeout(10000);
    await redisClient.set(
      'rate_limit:camera_data_traffic:0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      50 * 1024 * 1024 * 1024 - 1,
    );
    await request(TEST_BACKEND_APP)
      .post('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index.m3u8')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(file)
      .expect(200);
    const response = await request(TEST_BACKEND_APP)
      .post('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index.m3u8')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(file)
      .expect(429);
    expect(response.body).to.deep.equal({
      error_code: 'TOO_MANY_REQUESTS',
      error_message: 'Too much camera traffic used this month',
      status: 429,
    });
  });
  it('should upload camera chunk file', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .post('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index0.ts')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(file);
    expect(response.body).to.deep.equal({ success: true });
  });
  it('should upload camera chunk file', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .post('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index1.ts')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(file);
    expect(response.body).to.deep.equal({ success: true });
  });
  it('should upload camera chunk file', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .post('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index120.ts')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(file);
    expect(response.body).to.deep.equal({ success: true });
  });
  it('should upload camera chunk file and then clean folder', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .post('/cameras/camera-6c390d98-60be-4312-8c7c-db7daf402c07/index1.ts')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(file);
    expect(response.body).to.deep.equal({ success: true });
    const responseClean = await request(TEST_BACKEND_APP)
      .delete('/cameras/camera-6c390d98-60be-4312-8c7c-db7daf402c07')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance);
    expect(responseClean.body).to.deep.equal({ success: true });
    // try to clean a second time to check that cleaning an empty folder
    // is not an issue
    const responseClean2 = await request(TEST_BACKEND_APP)
      .delete('/cameras/camera-6c390d98-60be-4312-8c7c-db7daf402c07')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance);
    expect(responseClean2.body).to.deep.equal({ success: true });
  });
  it('should get camera file', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .get('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index.m3u8')
      .set('Accept', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenDashboard);
    expect(response.body.toString()).to.equal('test');
  });
  it('should start streaming & get camera file with access key', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .post('/cameras/streaming/start')
      .set('Accept', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenDashboard);
    expect(response.body).to.have.property('stream_access_key');
    const responseFile = await request(TEST_BACKEND_APP)
      .get(`/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/${response.body.stream_access_key}/index.m3u8`)
      .set('Accept', 'application/octet-stream');
    expect(responseFile.body.toString()).to.equal('test');
  });
  it('should return 403', async function Test() {
    this.timeout(10000);
    await request(TEST_BACKEND_APP)
      .get(`/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/UNKNOWN/index.m3u8`)
      .set('Accept', 'application/octet-stream')
      .expect(403);
  });
  it('should return 429 too many camera traffic', async function Test() {
    this.timeout(10000);
    await request(TEST_BACKEND_APP)
      .post('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index.m3u8')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(file);
    await redisClient.set(
      'rate_limit:camera_data_traffic:0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      50 * 1024 * 1024 * 1024,
    );
    const response = await request(TEST_BACKEND_APP)
      .get('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index.m3u8')
      .set('Accept', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(429);
    expect(response.body).to.deep.equal({
      error_code: 'TOO_MANY_REQUESTS',
      error_message: 'Too much camera traffic used this month',
      status: 429,
    });
  });
  it('should allow request even if consumed points is more than allowed', async function Test() {
    this.timeout(10000);
    await request(TEST_BACKEND_APP)
      .post('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index.m3u8')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(file);
    await redisClient.set(
      'rate_limit:camera_data_traffic:0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      50 * 1024 * 1024 * 1024 - 1,
    );
    const response = await request(TEST_BACKEND_APP)
      .get('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index.m3u8')
      .set('Accept', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(200);
    expect(response.body.toString()).to.equal('test');
    const nextQueryResponse = await request(TEST_BACKEND_APP)
      .get('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index.m3u8')
      .set('Accept', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(429);
    expect(nextQueryResponse.body).to.deep.equal({
      error_code: 'TOO_MANY_REQUESTS',
      error_message: 'Too much camera traffic used this month',
      status: 429,
    });
  });
  it('should get camera fake key file', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .get('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index.m3u8.key')
      .set('Accept', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenDashboard);
    expect(response.body.toString()).to.equal('not-a-key');
  });
  it('should return 404 not found', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .get('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/index1209900.ts')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(404);
    expect(response.body).to.deep.equal({
      status: 404,
      error_code: 'NOT_FOUND',
      error_message: 'File not found',
    });
  });
  it('should return 400, wrong session id', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .get('/cameras/11ff9014-6fa5-473c-8f38-0d798ba977bf/0f7fcced-6c7c-4cf9-b6a0-18ad50f6033a')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(400);
    expect(response.body).to.deep.equal({
      status: 400,
      error_code: 'BAD_REQUEST',
      error_message: 'Invalid session id',
    });
  });
  it('should return 400, wrong session id', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .get('/cameras/camera-....11ff9014-6fa5-473c-8f38-0d798ba977bf/0f7fcced-6c7c-4cf9-b6a0-18ad50f6033a')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(400);
    expect(response.body).to.deep.equal({
      status: 400,
      error_code: 'BAD_REQUEST',
      error_message: 'Invalid session id',
    });
  });
  it('should return 400, wrong filename', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .get('/cameras/camera-11ff9014-6fa5-473c-8f38-0d798ba977bf/0f7fcced-6c7c-4cf9-b6a0-18ad50f6033a')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(400);
    expect(response.body).to.deep.equal({
      status: 400,
      error_code: 'BAD_REQUEST',
      error_message: 'Invalid filename',
    });
  });
});
