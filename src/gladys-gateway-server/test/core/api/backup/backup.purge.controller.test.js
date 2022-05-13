const request = require('supertest');
const fs = require('fs');
const path = require('path');
const aws = require('aws-sdk');
const { expect, assert } = require('chai');

describe('POST /admin/api/backups/purge', () => {
  it('should dry run the purge backup command', async () => {
    const arr = [];
    const now = new Date();

    for (let i = 0; i < 364; i += 1) {
      const date = new Date(new Date().setDate(now.getDate() - i));
      arr.push({
        account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
        path: 'https://path.com',
        size: 100,
        status: 'successed',
        created_at: date,
        updated_at: date,
      });
    }
    await TEST_DATABASE_INSTANCE.t_backup.insert(arr);
    const response = await request(TEST_BACKEND_APP)
      .post('/admin/api/backups/purge')
      .set('Accept', 'application/json')
      .set('Authorization', process.env.ADMIN_API_AUTHORIZATION_TOKEN)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.be.instanceOf(Array);
    expect(response.body).to.deep.equal([
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
        nb_backups_to_keep: 7,
        nb_backups_to_delete: 355,
      },
      {
        id: 'be2b9666-5c72-451e-98f4-efca76ffef54',
        nb_backups_to_keep: 0,
        nb_backups_to_delete: 0,
      },
    ]);
  });
  it('should execute the purge backup command', async function Test() {
    this.timeout(20000);
    const spacesEndpoint = new aws.Endpoint(process.env.STORAGE_ENDPOINT);
    const s3 = new aws.S3({
      endpoint: spacesEndpoint,
    });
    async function uploadFile() {
      const filePath = path.join(__dirname, 'file_to_upload.enc');
      const fileStream = fs.createReadStream(filePath);
      const key = '7cadd367-5678-426f-b4c7-2c8e521af754-test-file';
      const uploadParams = {
        Bucket: process.env.STORAGE_BUCKET,
        // Add the required 'Key' parameter using the 'path' module.
        Key: key,
        // Add the required 'Body' parameter
        Body: fileStream,
      };

      await s3.upload(uploadParams).promise();
      const signedUrl = await s3.getSignedUrlPromise('getObject', {
        Bucket: process.env.STORAGE_BUCKET,
        Key: key,
        Expires: 6 * 60 * 60, // URL is valid 6 hours
      });
      return {
        key,
        signedUrl,
        url: signedUrl.split('?')[0],
        params: {
          Bucket: process.env.STORAGE_BUCKET,
          // Add the required 'Key' parameter using the 'path' module.
          Key: key,
        },
      };
    }
    const arr = [];
    const now = new Date();
    const { url, params } = await uploadFile();
    for (let i = 0; i < 29; i += 1) {
      const date = new Date(new Date().setDate(now.getDate() - i));
      arr.push({
        account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
        path: url,
        size: 100,
        status: 'successed',
        created_at: date,
        updated_at: date,
      });
    }
    await TEST_DATABASE_INSTANCE.t_backup.insert(arr);
    const response = await request(TEST_BACKEND_APP)
      .post('/admin/api/backups/purge')
      .set('Accept', 'application/json')
      .set('Authorization', process.env.ADMIN_API_AUTHORIZATION_TOKEN)
      .send({
        execute_delete: true,
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.be.instanceOf(Array);
    expect(response.body).to.deep.equal([
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
        nb_backups_to_keep: 2,
        nb_backups_to_delete: 25,
      },
      {
        id: 'be2b9666-5c72-451e-98f4-efca76ffef54',
        nb_backups_to_keep: 0,
        nb_backups_to_delete: 0,
      },
    ]);
    try {
      await s3.headObject(params).promise();
      assert.fail();
    } catch (e) {
      expect(e).to.have.property('statusCode', 404);
    }
    const backupsRemainingCount = await TEST_DATABASE_INSTANCE.t_backup.find({
      account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      status: 'successed',
    });
    expect(backupsRemainingCount).to.have.lengthOf(5);
  });
  it('should return 401, wrong header', async () => {
    await request(TEST_BACKEND_APP)
      .post('/admin/api/backups/purge')
      .set('Accept', 'application/json')
      .set('Authorization', 'toto')
      .expect('Content-Type', /json/)
      .expect(401);
  });
  it('should return 401, empty string header', async () => {
    await request(TEST_BACKEND_APP)
      .post('/admin/api/backups/purge')
      .set('Accept', 'application/json')
      .set('Authorization', '')
      .expect('Content-Type', /json/)
      .expect(401);
  });
  it('should return 401, empty header', async () => {
    await request(TEST_BACKEND_APP)
      .post('/admin/api/backups/purge')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(401);
  });
});
