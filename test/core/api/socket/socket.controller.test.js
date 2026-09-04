const { io } = require('socket.io-client');
const { expect } = require('chai');
const jsonwebtoken = require('jsonwebtoken');
const Jwt = require('../../../../core/service/jwt');

describe('socket', function Describe() {
  this.timeout(5000);
  it('should connect to socket.io server', (done) => {
    const jwt = Jwt();

    const jwtAccessToken = jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, [
      'dashboard:read',
      'dashboard:write',
    ]);

    const socket = io(`http://localhost:${process.env.SERVER_PORT}`);

    socket.on('connect', () => {
      socket.emit('user-authentication', { access_token: jwtAccessToken }, (data) => {
        expect(data).to.have.property('authenticated', true);
        done();
      });
    });
  });

  it('should connect to socket.io server as user, directly with auth passed', (done) => {
    const jwt = Jwt();

    const jwtAccessToken = jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, [
      'dashboard:read',
      'dashboard:write',
    ]);

    const socket = io(`http://localhost:${process.env.SERVER_PORT}`, {
      auth: {
        auth_type: 'user',
        access_token: jwtAccessToken,
      },
    });

    socket.on('user-authenticated', () => {
      socket.emit('latency', Date.now(), (data) => {
        expect(data).to.be.greaterThan(0);
        done();
      });
    });
  });

  it('should fail to connect as user, user does not exist', (done) => {
    const jwt = Jwt();

    const jwtAccessTokenForUnknownUser = jwt.generateAccessToken({ id: '1dd07393-f052-4395-bbd7-dc932e2a2f4b' }, [
      'dashboard:read',
      'dashboard:write',
    ]);

    const socket = io(`http://localhost:${process.env.SERVER_PORT}`, {
      auth: {
        auth_type: 'user',
        access_token: jwtAccessTokenForUnknownUser,
      },
    });

    socket.on('user-authentication-failed', (data) => {
      expect(data).to.have.property('reason', 'USER_NOT_FOUND');
      done();
    });
  });

  it('should fail to connect as user, bad jwt', (done) => {
    const badJwt = jsonwebtoken.sign({ user_id: 'test', scope: ['dashboard:read', 'dashboard:write'] }, 'bad-secret', {
      algorithm: 'HS256',
      audience: 'user',
      issuer: 'gladys-gateway',
      expiresIn: 1 * 60 * 60, // access token is valid 1 hour
    });

    const socket = io(`http://localhost:${process.env.SERVER_PORT}`, {
      auth: {
        auth_type: 'user',
        access_token: badJwt,
      },
    });

    socket.on('user-authentication-failed', (data) => {
      expect(data).to.have.property('reason', 'invalid signature');
      done();
    });
  });

  it('should fail to connect as instance, instance does not exist', (done) => {
    const jwt = Jwt();

    const jwtAccessTokenForUnknownInstance = jwt.generateAccessTokenInstance({
      id: 'd28a4e3e-ac60-44f7-bdfe-8c9deafa51d3',
    });

    const socket = io(`http://localhost:${process.env.SERVER_PORT}`, {
      auth: {
        auth_type: 'instance',
        access_token: jwtAccessTokenForUnknownInstance,
      },
    });

    socket.on('instance-authentication-failed', (data) => {
      expect(data).to.have.property('reason', 'INSTANCE_NOT_FOUND');
      done();
    });
  });

  it('should connect to socket.io server as instance, directly with auth passed', (done) => {
    const jwt = Jwt();

    const jwtAccessToken = jwt.generateAccessTokenInstance({ id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf' });

    const socket = io(`http://localhost:${process.env.SERVER_PORT}`, {
      auth: {
        auth_type: 'instance',
        access_token: jwtAccessToken,
      },
    });

    socket.on('instance-authenticated', () => {
      socket.emit('latency', Date.now(), (data) => {
        expect(data).to.be.greaterThan(0);
        done();
      });
    });
  });

  it('should connect to socket.io server with instance authentication', (done) => {
    const jwt = Jwt();

    const jwtAccessToken = jwt.generateAccessTokenInstance({ id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf' });

    const socket = io(`http://localhost:${process.env.SERVER_PORT}`);

    socket.on('connect', () => {
      socket.emit('instance-authentication', { access_token: jwtAccessToken }, (data) => {
        expect(data).to.have.property('authenticated', true);
        done();
      });
    });
  });

  it('should test end to end user to instance communication one different instances', (done) => {
    const jwt = Jwt();

    const jwtAccessTokenInstance = jwt.generateAccessTokenInstance({ id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf' });
    const socketInstance = io(`http://localhost:${process.env.SERVER_PORT}`);
    const jwtAccessTokenUser = jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, [
      'dashboard:read',
      'dashboard:write',
    ]);
    const socketUser = io(`http://localhost:${process.env.SERVER_PORT + 1}`);

    let instanceConnected = false;

    socketInstance.on('connect', () => {
      socketInstance.emit('instance-authentication', { access_token: jwtAccessTokenInstance }, (data) => {
        instanceConnected = true;
        expect(data).to.have.property('authenticated', true);
      });
    });
    socketInstance.on('message', (data, cb) => {
      expect(data).to.deep.equal({
        data: 'test-data',
        instance_id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
        sender_id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
        local_user_id: null,
      });
      cb({ response: 'response' });
    });

    socketUser.on('connect', () => {
      socketUser.emit('user-authentication', { access_token: jwtAccessTokenUser }, (data) => {
        expect(data).to.have.property('authenticated', true);
        const emitMessage = () => {
          socketUser.emit(
            'message',
            {
              data: 'test-data',
              instance_id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
            },
            (response) => {
              expect(response).to.deep.equal({ response: 'response' });
              done();
            },
          );
        };
        const waitUntilInstanceConnected = () => {
          setTimeout(() => {
            if (instanceConnected) {
              emitMessage();
            } else {
              waitUntilInstanceConnected();
            }
          }, 5);
        };
        waitUntilInstanceConnected();
      });
    });
  });

  it('should test end to end user to instance communication one same instance', (done) => {
    const jwt = Jwt();

    const jwtAccessTokenInstance = jwt.generateAccessTokenInstance({ id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf' });
    const socketInstance = io(`http://localhost:${process.env.SERVER_PORT}`);
    const jwtAccessTokenUser = jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, [
      'dashboard:read',
      'dashboard:write',
    ]);
    const socketUser = io(`http://localhost:${process.env.SERVER_PORT}`);

    let instanceConnected = false;
    socketInstance.on('connect', () => {
      socketInstance.emit('instance-authentication', { access_token: jwtAccessTokenInstance }, (data) => {
        instanceConnected = true;
        expect(data).to.have.property('authenticated', true);
      });
    });
    socketInstance.on('message', (data, cb) => {
      expect(data).to.deep.equal({
        data: 'test-data',
        instance_id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
        sender_id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
        local_user_id: null,
      });
      cb({ response: 'response' });
    });

    socketUser.on('connect', () => {
      socketUser.emit('user-authentication', { access_token: jwtAccessTokenUser }, (data) => {
        expect(data).to.have.property('authenticated', true);
        const emitMessage = () => {
          socketUser.emit(
            'message',
            {
              data: 'test-data',
              instance_id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
            },
            (response) => {
              expect(response).to.deep.equal({ response: 'response' });
              done();
            },
          );
        };
        const waitUntilInstanceConnected = () => {
          setTimeout(() => {
            if (instanceConnected) {
              emitMessage();
            } else {
              waitUntilInstanceConnected();
            }
          }, 5);
        };
        waitUntilInstanceConnected();
      });
    });
  });

  it('should test end to end instance to user communication one same instance', (done) => {
    const jwt = Jwt();

    const jwtAccessTokenInstance = jwt.generateAccessTokenInstance({ id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf' });
    const socketInstance = io(`http://localhost:${process.env.SERVER_PORT}`);
    const jwtAccessTokenUser = jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, [
      'dashboard:read',
      'dashboard:write',
    ]);
    const socketUser = io(`http://localhost:${process.env.SERVER_PORT}`);

    let userConnected = false;

    socketUser.on('connect', () => {
      socketUser.emit('user-authentication', { access_token: jwtAccessTokenUser }, (data) => {
        expect(data).to.have.property('authenticated', true);
        userConnected = true;
      });
    });

    socketUser.on('message', (data) => {
      expect(data).to.deep.equal({
        data: 'test-data',
        user_id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
        instance_id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      });
      done();
    });

    socketInstance.on('connect', () => {
      socketInstance.emit('instance-authentication', { access_token: jwtAccessTokenInstance }, (data) => {
        expect(data).to.have.property('authenticated', true);
        const emitMessage = () => {
          socketInstance.emit('message', {
            data: 'test-data',
            user_id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
          });
        };
        const waitUntilUserIsConnected = () => {
          setTimeout(() => {
            if (userConnected) {
              emitMessage();
            } else {
              waitUntilUserIsConnected();
            }
          }, 5);
        };
        waitUntilUserIsConnected();
      });
    });
  });

  it('should test end to end instance to user communication one different instance', (done) => {
    const jwt = Jwt();

    const jwtAccessTokenInstance = jwt.generateAccessTokenInstance({ id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf' });
    const socketInstance = io(`http://localhost:${process.env.SERVER_PORT}`);
    const jwtAccessTokenUser = jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, [
      'dashboard:read',
      'dashboard:write',
    ]);
    const socketUser = io(`http://localhost:${process.env.SERVER_PORT + 1}`);

    let userConnected = false;

    socketUser.on('connect', () => {
      socketUser.emit('user-authentication', { access_token: jwtAccessTokenUser }, (data) => {
        expect(data).to.have.property('authenticated', true);
        userConnected = true;
      });
    });

    socketUser.on('message', (data) => {
      expect(data).to.deep.equal({
        data: 'test-data',
        user_id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
        instance_id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      });
      done();
    });

    socketInstance.on('connect', () => {
      socketInstance.emit('instance-authentication', { access_token: jwtAccessTokenInstance }, (data) => {
        expect(data).to.have.property('authenticated', true);
        const emitMessage = () => {
          socketInstance.emit('message', {
            data: 'test-data',
            user_id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
          });
        };
        const waitUntilUserIsConnected = () => {
          setTimeout(() => {
            if (userConnected) {
              emitMessage();
            } else {
              waitUntilUserIsConnected();
            }
          }, 5);
        };
        waitUntilUserIsConnected();
      });
    });
  });

  it('should not relay a user message to an instance of another account', async () => {
    const jwt = Jwt();
    // instance of another account
    const otherInstanceId = '7f3c9d2a-5b1e-4c8f-9a6d-2e4b8c1f0a3d';
    await TEST_DATABASE_INSTANCE.t_instance.insert({
      id: otherInstanceId,
      name: 'Other account instance',
      account_id: 'be2b9666-5c72-451e-98f4-efca76ffef54',
      rsa_public_key: 'public-key',
      ecdsa_public_key: 'public-key',
    });

    const socketInstance = io(`http://localhost:${process.env.SERVER_PORT}`, {
      auth: { auth_type: 'instance', access_token: jwt.generateAccessTokenInstance({ id: otherInstanceId }) },
    });
    const socketUser = io(`http://localhost:${process.env.SERVER_PORT}`, {
      auth: {
        auth_type: 'user',
        access_token: jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, [
          'dashboard:read',
          'dashboard:write',
        ]),
      },
    });

    let messagesReceivedByInstance = 0;
    socketInstance.on('message', (data, cb) => {
      messagesReceivedByInstance += 1;
      cb({ response: 'should-not-happen' });
    });

    await Promise.all([
      new Promise((resolve) => {
        socketInstance.on('instance-authenticated', resolve);
      }),
      new Promise((resolve) => {
        socketUser.on('user-authenticated', resolve);
      }),
    ]);

    const response = await new Promise((resolve) => {
      socketUser.emit('message', { data: 'test-data', instance_id: otherInstanceId }, resolve);
    });
    expect(response).to.deep.equal({ status: 404, error_code: 'NOT_FOUND', error_message: 'NO_INSTANCE_FOUND' });
    expect(messagesReceivedByInstance).to.equal(0);
    socketInstance.disconnect();
    socketUser.disconnect();
  });

  it('should not relay an instance message to a user of another account', async () => {
    const jwt = Jwt();
    const otherInstanceId = '7f3c9d2a-5b1e-4c8f-9a6d-2e4b8c1f0a3d';
    await TEST_DATABASE_INSTANCE.t_instance.insert({
      id: otherInstanceId,
      name: 'Other account instance',
      account_id: 'be2b9666-5c72-451e-98f4-efca76ffef54',
      rsa_public_key: 'public-key',
      ecdsa_public_key: 'public-key',
    });

    const socketInstance = io(`http://localhost:${process.env.SERVER_PORT}`, {
      auth: { auth_type: 'instance', access_token: jwt.generateAccessTokenInstance({ id: otherInstanceId }) },
    });
    const socketUser = io(`http://localhost:${process.env.SERVER_PORT}`, {
      auth: {
        auth_type: 'user',
        access_token: jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, [
          'dashboard:read',
          'dashboard:write',
        ]),
      },
    });

    let messagesReceivedByUser = 0;
    socketUser.on('message', () => {
      messagesReceivedByUser += 1;
    });

    await Promise.all([
      new Promise((resolve) => {
        socketInstance.on('instance-authenticated', resolve);
      }),
      new Promise((resolve) => {
        socketUser.on('user-authenticated', resolve);
      }),
    ]);

    socketInstance.emit('message', { data: 'test-data', user_id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' });
    // give the server time to relay the message if it were to do it
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(messagesReceivedByUser).to.equal(0);
    socketInstance.disconnect();
    socketUser.disconnect();
  });

  it('should authenticate a socket only once and relay each message only once', async () => {
    const jwt = Jwt();
    const jwtAccessTokenUser = jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, [
      'dashboard:read',
      'dashboard:write',
    ]);
    const socketInstance = io(`http://localhost:${process.env.SERVER_PORT}`, {
      auth: {
        auth_type: 'instance',
        access_token: jwt.generateAccessTokenInstance({ id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf' }),
      },
    });
    const socketUser = io(`http://localhost:${process.env.SERVER_PORT}`, {
      auth: { auth_type: 'user', access_token: jwtAccessTokenUser },
    });

    let messagesReceivedByInstance = 0;
    socketInstance.on('message', (data, cb) => {
      messagesReceivedByInstance += 1;
      cb({ response: 'response' });
    });

    await Promise.all([
      new Promise((resolve) => {
        socketInstance.on('instance-authenticated', resolve);
      }),
      new Promise((resolve) => {
        socketUser.on('user-authenticated', resolve);
      }),
    ]);

    // authenticating again on an already authenticated socket is a no-op
    const secondAuth = await new Promise((resolve) => {
      socketUser.emit('user-authentication', { access_token: jwtAccessTokenUser }, resolve);
    });
    expect(secondAuth).to.deep.equal({ authenticated: true });

    const response = await new Promise((resolve) => {
      socketUser.emit('message', { data: 'test-data', instance_id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf' }, resolve);
    });
    expect(response).to.deep.equal({ response: 'response' });
    // let any duplicated relay arrive before counting
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    expect(messagesReceivedByInstance).to.equal(1);
    socketInstance.disconnect();
    socketUser.disconnect();
  });

  it('should not connect to socket.io server, wrong scope', (done) => {
    const jwt = Jwt();

    const jwtAccessToken = jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, []);

    const socket = io(`http://localhost:${process.env.SERVER_PORT}`);

    socket.on('connect', () => {
      socket.emit('user-authentication', { access_token: jwtAccessToken }, (data) => {
        expect(data).to.have.property('authenticated', false);
        done();
      });
    });
  });

  it('should not connect to socket.io server, wrong jwt', (done) => {
    const socket = io(`http://localhost:${process.env.SERVER_PORT}`);

    socket.on('connect', () => {
      socket.emit('user-authentication', { access_token: 'wrong-jwt' }, (data) => {
        expect(data).to.have.property('authenticated', false);
        done();
      });
    });
  });
});
