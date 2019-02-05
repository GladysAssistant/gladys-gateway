const io = require('socket.io-client');
const Jwt = require('../../../../core/service/jwt');

describe('socket', () => {
  it('should connect to socket.io server', (done) => {
    const jwt = Jwt();

    const jwtAccessToken = jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, ['dashboard:read', 'dashboard:write']);

    const socket = io(`http://localhost:${process.env.SERVER_PORT}`);

    socket.on('connect', () => {
      socket.emit('user-authentication', { access_token: jwtAccessToken }, (data) => {
        data.should.have.property('authenticated', true);
        done();
      });
    });
  });

  it('should not connect to socket.io server, wrong scope', (done) => {
    const jwt = Jwt();

    const jwtAccessToken = jwt.generateAccessToken({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, []);

    const socket = io(`http://localhost:${process.env.SERVER_PORT}`);

    socket.on('connect', () => {
      socket.emit('user-authentication', { access_token: jwtAccessToken }, (data) => {
        data.should.have.property('authenticated', false);
        done();
      });
    });
  });

  it('should not connect to socket.io server, wrong jwt', (done) => {
    const socket = io(`http://localhost:${process.env.SERVER_PORT}`);

    socket.on('connect', () => {
      socket.emit('user-authentication', { access_token: 'wrong-jwt' }, (data) => {
        data.should.have.property('authenticated', false);
        done();
      });
    });
  });
});
