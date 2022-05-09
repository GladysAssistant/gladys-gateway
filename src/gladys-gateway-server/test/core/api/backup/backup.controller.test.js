const request = require('supertest');
const fs = require('fs');
const path = require('path');
const Promise = require('bluebird');
const axios = require('axios');
const { expect } = require('chai');

const { readChunk } = require('./utils.test');
const configTest = require('../../../tasks/config');

describe('GET /backups', () => {
  it('should return list of backups', async () => {
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
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(finalResponse.body).to.have.property('signed_url');
    const { data } = await axios.get(finalResponse.body.signed_url);
    expect(data).to.equal('toto');
  });
});
