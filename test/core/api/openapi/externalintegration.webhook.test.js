const request = require('supertest');
const { io } = require('socket.io-client');
const { expect } = require('chai');
const Jwt = require('../../../../core/service/jwt');

const OPEN_API_KEY = '01908032961c3ec3813abaa967c3b1ae5111d84628e2f94d500a1d7e8b812bdd90b2a08e327534db';
const INSTANCE_ID = '0bc53f3c-1e11-40d3-99a4-bd392a666eaf';

describe('External integration webhook end-to-end', function Describe() {
  this.timeout(10000);

  const connectInstance = (onOpenApiMessage, onConnected) => {
    const jwt = Jwt();
    const jwtAccessTokenInstance = jwt.generateAccessTokenInstance({ id: INSTANCE_ID });
    const socketInstance = io(`http://localhost:${process.env.SERVER_PORT}`);

    socketInstance.on('connect', () => {
      socketInstance.emit('instance-authentication', { access_token: jwtAccessTokenInstance }, (data) => {
        expect(data).to.have.property('authenticated', true);
        onConnected();
      });
    });
    socketInstance.on('open-api-message', onOpenApiMessage);

    return socketInstance;
  };

  it('should relay webhook to instance and return the sync response', (done) => {
    const socketInstance = connectInstance(
      (message, cb) => {
        expect(message).to.have.property('type', 'gladys-open-api');
        expect(message).to.have.property('action', 'external-integration-webhook');
        expect(message).to.have.property('instance_id', INSTANCE_ID);
        expect(message.data).to.deep.equal({
          selector: 'netatmo-external',
          webhook_key: 'events',
          method: 'POST',
          query: { param: 'value' },
          body: '{"event":"test"}',
          content_type: 'application/json',
        });
        cb({ status: 201, content_type: 'application/json', body: '{"received":true}' });
      },
      () => {
        request(TEST_BACKEND_APP)
          .post(`/v1/api/external-integration/${OPEN_API_KEY}/netatmo-external/events`)
          .query({ param: 'value' })
          .set('Content-Type', 'application/json')
          .send('{"event":"test"}')
          .expect('Content-Type', /json/)
          .expect(201)
          .then((response) => {
            expect(response.text).to.equal('{"received":true}');
            socketInstance.disconnect();
            done();
          })
          .catch(done);
      },
    );
  });

  it('should return an empty 200 on a fire and forget ack', (done) => {
    const socketInstance = connectInstance(
      (message, cb) => {
        expect(message).to.have.property('action', 'external-integration-webhook');
        expect(message.data).to.have.property('webhook_key', 'motion-detected');
        expect(message.data).to.have.property('method', 'GET');
        expect(message.data).to.have.property('body', '');
        cb({ status: 200 });
      },
      () => {
        request(TEST_BACKEND_APP)
          .get(`/v1/api/external-integration/${OPEN_API_KEY}/my-camera/motion-detected`)
          .expect(200)
          .then((response) => {
            expect(response.text).to.equal('');
            socketInstance.disconnect();
            done();
          })
          .catch(done);
      },
    );
  });

  it('should return an empty 200 when the instance never answers (timeout)', (done) => {
    process.env.EXTERNAL_INTEGRATION_WEBHOOK_TIMEOUT_MS = '200';
    const socketInstance = connectInstance(
      (message, cb) => {
        // the instance never acks the message
      },
      () => {
        request(TEST_BACKEND_APP)
          .post(`/v1/api/external-integration/${OPEN_API_KEY}/my-integration/events`)
          .set('Content-Type', 'application/json')
          .send('{}')
          .expect(200)
          .then((response) => {
            expect(response.text).to.equal('');
            delete process.env.EXTERNAL_INTEGRATION_WEBHOOK_TIMEOUT_MS;
            socketInstance.disconnect();
            done();
          })
          .catch((e) => {
            delete process.env.EXTERNAL_INTEGRATION_WEBHOOK_TIMEOUT_MS;
            done(e);
          });
      },
    );
  });

  it('should return an empty 200 when the instance ack is invalid', (done) => {
    const socketInstance = connectInstance(
      (message, cb) => {
        cb({ status: 500, body: 'boom' });
      },
      () => {
        request(TEST_BACKEND_APP)
          .post(`/v1/api/external-integration/${OPEN_API_KEY}/my-integration/events`)
          .set('Content-Type', 'application/json')
          .send('{}')
          .expect(200)
          .then((response) => {
            expect(response.text).to.equal('');
            socketInstance.disconnect();
            done();
          })
          .catch(done);
      },
    );
  });
});
