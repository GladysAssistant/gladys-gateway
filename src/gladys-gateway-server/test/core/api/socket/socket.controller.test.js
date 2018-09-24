var io = require('socket.io-client');
const configTest = require('../../../tasks/config');

describe('socket', function(){
  it('should connect to socket.io server', function(done){
    var jwt = require('../../../../core/service/jwt')();

    var jwtAccessToken = jwt.generateAccessToken({id: 'a139e4a6-ec6c-442d-9730-0499155d38d4'}, ['dashboard:read', 'dashboard:write']);

    var socket = io('http://localhost:' + process.env.SERVER_PORT);

    socket.on('connect', function() {
      socket.emit('user-authentication', { access_token: jwtAccessToken }, function (data) {
        data.should.have.property('authenticated', true);
        done();
      });
    });
  });

  it('should not connect to socket.io server, wrong scope', function(done){
    var jwt = require('../../../../core/service/jwt')();

    var jwtAccessToken = jwt.generateAccessToken({id: 'a139e4a6-ec6c-442d-9730-0499155d38d4'}, []);

    var socket = io('http://localhost:' + process.env.SERVER_PORT);

    socket.on('connect', function() {
      socket.emit('user-authentication', { access_token: jwtAccessToken }, function (data) {
        data.should.have.property('authenticated', false);
        done();
      });
    });
  });

  it('should not connect to socket.io server, wrong jwt', function(done){

    var socket = io('http://localhost:' + process.env.SERVER_PORT);

    socket.on('connect', function() {
      socket.emit('user-authentication', { access_token: 'wrong-jwt' }, function (data) {
        data.should.have.property('authenticated', false);
        done();
      });
    });
  });
});