const request = require('supertest');
const { promises: fs } = require('fs');
const path = require('path');
const { expect } = require('chai');

const configTest = require('../../../tasks/config');

describe('cameraController', () => {
  it('should upload camera file', async function Test() {
    this.timeout(10000);
    const filePath = path.join(__dirname, 'file_to_upload.txt');
    const file = await fs.readFile(filePath);
    const response = await request(TEST_BACKEND_APP)
      .post('/cameras/11ff9014-6fa5-473c-8f38-0d798ba977bf/test.txt')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(file);
    expect(response.body).to.deep.equal({ success: true });
  });
  it('should get camera file', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .get('/cameras/11ff9014-6fa5-473c-8f38-0d798ba977bf/test.txt')
      .set('Accept', 'application/octet-stream')
      .set('Authorization', configTest.jwtAccessTokenDashboard);
    expect(response.body.toString()).to.equal('test');
  });
  it('should return 404 not found', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .get('/cameras/11ff9014-6fa5-473c-8f38-0d798ba977bf/0f7fcced-6c7c-4cf9-b6a0-18ad50f6033a')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect(404);
    expect(response.body).to.deep.equal({
      status: 404,
      error_code: 'NOT_FOUND',
      error_message: 'File not found',
    });
  });
});
