const request = require('supertest');
const fs = require('fs');
const path = require('path');
const Promise = require('bluebird');
const axios = require('axios');
const { expect } = require('chai');

const { readChunk } = require('./utils.test');
const configTest = require('../../../tasks/config');

describe('GET /backups', () => {
  it('should return list of successful backups', async () => {
    const response = await request(TEST_BACKEND_APP)
      .get('/backups')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .expect('Content-Type', /json/)
      .expect(200);
    response.body.forEach((backup) => {
      expect(backup.path).to.satisfies((url) => url.indexOf('X-Amz-Credential') !== -1);
      // eslint-disable-next-line
      backup.path = backup.path.split('?')[0];
    });
    expect(response.body).to.deep.equal([
      {
        id: '74dc8d58-3997-484a-a791-53e5b07279d7',
        account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
        path: `https://${process.env.STORAGE_BUCKET}.${process.env.STORAGE_ENDPOINT}/un-autre-backup.enc`,
        size: 1000,
        status: 'successed',
        created_at: '2018-10-16T02:21:25.901Z',
        updated_at: '2018-10-16T02:21:25.901Z',
        is_deleted: false,
      },
    ]);
  });
});

describe('Upload backup', () => {
  it('should upload small backup', async function Test() {
    this.timeout(10000);
    const filePath = path.join(__dirname, 'file_to_upload.enc');
    const fileSize = fs.statSync(filePath).size;
    const response = await request(TEST_BACKEND_APP)
      .post('/backups/multi_parts/initialize')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        file_size: fileSize,
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.have.property('file_id');
    expect(response.body).to.have.property('file_key');
    expect(response.body).to.have.property('parts');
    expect(response.body).to.have.property('chunk_size');
    expect(response.body).to.have.property('backup_id');
    response.body.parts.forEach((part) => {
      expect(part).to.have.property('signed_url');
      expect(part).to.have.property('part_number');
    });
    const partsUploaded = await Promise.mapSeries(response.body.parts, async (part, index) => {
      const startPosition = index * response.body.chunk_size;
      const chunk = await readChunk(filePath, { length: response.body.chunk_size, startPosition });
      const options = {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      };
      const { headers } = await axios.put(part.signed_url, chunk, options);
      return {
        PartNumber: part.part_number,
        ETag: headers.etag.replace(/"/g, ''),
      };
    });
    const finalResponse = await request(TEST_BACKEND_APP)
      .post('/backups/multi_parts/finalize')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        file_key: response.body.file_key,
        file_id: response.body.file_id,
        parts: partsUploaded,
        backup_id: response.body.backup_id,
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(finalResponse.body).to.have.property('signed_url');
    expect(finalResponse.body).to.have.property('backup');
    expect(finalResponse.body.backup).to.have.property('status', 'successed');
    const { data } = await axios.get(finalResponse.body.signed_url);
    expect(data).to.equal('toto');
  });
  it('should upload larger backup in multiple chunks', async function Test() {
    this.timeout(30000);
    const filePath = path.join(__dirname, 'larger_file_to_upload.enc');
    const fileSize = fs.statSync(filePath).size;
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const response = await request(TEST_BACKEND_APP)
      .post('/backups/multi_parts/initialize')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        file_size: fileSize,
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.have.property('file_id');
    expect(response.body).to.have.property('file_key');
    expect(response.body).to.have.property('parts');
    expect(response.body).to.have.property('chunk_size');
    response.body.parts.forEach((part) => {
      expect(part).to.have.property('signed_url');
      expect(part).to.have.property('part_number');
    });
    expect(response.body.parts).to.have.lengthOf(2);
    const partsUploaded = await Promise.map(response.body.parts, async (part, index) => {
      const startPosition = index * response.body.chunk_size;
      const chunk = await readChunk(filePath, { length: response.body.chunk_size, startPosition });
      const options = {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      };
      const { headers } = await axios.put(part.signed_url, chunk, options);
      return {
        PartNumber: part.part_number,
        ETag: headers.etag.replace(/"/g, ''),
      };
    });
    const finalResponse = await request(TEST_BACKEND_APP)
      .post('/backups/multi_parts/finalize')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        file_key: response.body.file_key,
        file_id: response.body.file_id,
        parts: partsUploaded,
        backup_id: response.body.backup_id,
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(finalResponse.body).to.have.property('signed_url');
    expect(finalResponse.body).to.have.property('backup');
    expect(finalResponse.body.backup).to.have.property('status', 'successed');
    const { data } = await axios.get(finalResponse.body.signed_url);
    expect(data).to.equal(fileContent);
  });
  it('should not upload backup, file too large', async function Test() {
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .post('/backups/multi_parts/initialize')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        file_size: 12 * 1024 * 1024 * 1024,
      })
      .expect('Content-Type', /json/)
      .expect(400);
    expect(response.body).to.deep.equal({
      status: 400,
      error_code: 'BAD_REQUEST',
      error_message: 'File is too large. Maximum file size is 10240 MB.',
    });
  });
  it('should not upload backup, wrong plan', async function Test() {
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      { plan: 'lite' },
    );
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .post('/backups/multi_parts/initialize')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        file_size: 12 * 1024 * 1024 * 1024,
      })
      .expect('Content-Type', /json/)
      .expect(402);
    expect(response.body).to.deep.equal({
      status: 402,
      error_code: 'PAYMENT_REQUIRED',
      error_message: 'Account is in plan lite and should be in plan plus',
    });
  });
  it('should not upload backup, inactive account', async function Test() {
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      { status: 'past_due' },
    );
    this.timeout(10000);
    const response = await request(TEST_BACKEND_APP)
      .post('/backups/multi_parts/initialize')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        file_size: 12 * 1024 * 1024 * 1024,
      })
      .expect('Content-Type', /json/)
      .expect(402);
    expect(response.body).to.deep.equal({
      status: 402,
      error_code: 'PAYMENT_REQUIRED',
      error_message: 'Account is not active',
    });
  });
  it('should return 404 backup not found', async function Test() {
    this.timeout(10000);
    const filePath = path.join(__dirname, 'file_to_upload.enc');
    const fileSize = fs.statSync(filePath).size;
    const response = await request(TEST_BACKEND_APP)
      .post('/backups/multi_parts/initialize')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        file_size: fileSize,
      })
      .expect('Content-Type', /json/)
      .expect(200);
    const partsUploaded = await Promise.mapSeries(response.body.parts, async (part, index) => {
      const startPosition = index * response.body.chunk_size;
      const chunk = await readChunk(filePath, { length: response.body.chunk_size, startPosition });
      const options = {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      };
      const { headers } = await axios.put(part.signed_url, chunk, options);
      return {
        PartNumber: part.part_number,
        ETag: headers.etag.replace(/"/g, ''),
      };
    });
    const finalResponse = await request(TEST_BACKEND_APP)
      .post('/backups/multi_parts/finalize')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        file_key: response.body.file_key,
        file_id: response.body.file_id,
        parts: partsUploaded,
        backup_id: 'ba1c1732-39de-41e2-83b8-9fabfb01cee5',
      })
      .expect('Content-Type', /json/)
      .expect(404);
    expect(finalResponse.body).to.deep.equal({
      status: 404,
      error_code: 'NOT_FOUND',
      error_message: 'Backup id was not found',
    });
  });
  it('should start backup & abort backup', async function Test() {
    this.timeout(10000);
    const filePath = path.join(__dirname, 'file_to_upload.enc');
    const fileSize = fs.statSync(filePath).size;
    const response = await request(TEST_BACKEND_APP)
      .post('/backups/multi_parts/initialize')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        file_size: fileSize,
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.have.property('file_id');
    expect(response.body).to.have.property('file_key');
    expect(response.body).to.have.property('parts');
    expect(response.body).to.have.property('chunk_size');
    expect(response.body).to.have.property('backup_id');
    response.body.parts.forEach((part) => {
      expect(part).to.have.property('signed_url');
      expect(part).to.have.property('part_number');
    });
    const finalResponse = await request(TEST_BACKEND_APP)
      .post('/backups/multi_parts/abort')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send({
        file_key: response.body.file_key,
        file_id: response.body.file_id,
        backup_id: response.body.backup_id,
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(finalResponse.body).to.have.property('status', 'failed');
    expect(finalResponse.body).to.have.property('path', null);
  });
});
