const request = require('supertest');
const nock = require('nock');
const { expect } = require('chai');

const configTest = require('../../../tasks/config');

const audioBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46]); // RIFF header stub

describe('POST /stt', () => {
  before(() => {
    process.env.SPEECH_TO_TEXT_URL = 'https://test-stt.com';
    process.env.SPEECH_TO_TEXT_API_KEY = 'my-token';
  });
  it('should proxy raw audio body to STT service', async () => {
    nock(process.env.SPEECH_TO_TEXT_URL, {
      encodedQueryParams: true,
      reqheaders: {
        authorization: 'Bearer my-token',
        'content-type': 'audio/wav',
      },
    })
      .post('/', audioBuffer)
      .reply(200, {
        text: 'bonjour',
      });
    await TEST_DATABASE_INSTANCE.t_account.update(
      {
        id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      },
      {
        status: 'active',
      },
    );
    const response = await request(TEST_BACKEND_APP)
      .post('/stt')
      .set('Accept', 'application/json')
      .set('Content-Type', 'audio/wav')
      .set('Authorization', configTest.jwtAccessTokenInstance)
      .send(audioBuffer)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({
      text: 'bonjour',
    });
  });
});
