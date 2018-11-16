const request = require('supertest');
const configTest = require('../../../tasks/config');

describe('POST /users/signup', function() {
  it('should signup one user', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/signup')
      .send({
        name: 'Tony',
        email: 'tony.stark@gladysproject.com',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(201)
      .then(response => {
        should.deepEqual(response.body, { 
          status: 201,
          message: 'User created with success. You need now to confirm your email.' 
        });
      });
  });

  it('should not signup user, missing attributes', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/signup')
      .send({
        email: 'tony.stark@gladysproject.com',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(422)
      .then(response => {
        
      });
  });
});

describe('POST /users/verify', function() {
  it('should verify one user email', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/verify')
      .send({
        email_confirmation_token: '0fbb7645bf4e9f6ed9f767b9957a57dc79fd828792374d3c91359054e1858e067f498e4479369e4b4fee4514be6ba14699805a33dbc6fb6f9b264d02772eacf9'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, {
          id: '29770e0d-26a9-444e-91a1-f175c99a5218',
          email: 'tony.stark@gladysproject.com',
          email_confirmed: true
        });
      });
  });
});

describe('POST /users/login-salt', function() {
  it('should return a salt', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/login-salt')
      .send({
        email: 'email-confirmed@gladysprojet.com'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, {
          srp_salt: 'e0812f8c57be08780bafcc7e2cbacd155b6f63962114c12cc12462a7aa669fdb'
        });
      });
  });
  it('should return 404 not found', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/login-salt')
      .send({
        email: 'this-email-doesnt-exist@gladysprojet.com'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(404)
      .then(response => {
        
      });
  });
});

describe('POST /users/login-generate-ephemeral', function() {
  it('should return a salt', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/login-generate-ephemeral')
      .send({
        email: 'email-confirmed@gladysprojet.com',
        client_ephemeral_public: 'heyheyhey'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('server_ephemeral_public');
        response.body.should.have.property('login_session_key');
      });
  });
  it('should return 404 not found', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/login-generate-ephemeral')
      .send({
        email: 'this-email-doesnt-exist@gladysprojet.com'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(404)
      .then(response => {
        
      });
  });
});

describe('POST /users/login-finalize', function() {
  var srpFixture = require('../../../tasks/srp-fixture.json');
  
  it('should return a server_session_proof and access_token', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/login-finalize')
      .send({
        login_session_key: '2b2aa099-4323-44e8-bb07-0b9b55dbe1dc',
        client_session_proof: srpFixture.clientSession.proof
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('server_session_proof');
        response.body.should.have.property('access_token');
      });
  });

  it('should return 403 forbidden. Wrong client proof', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/login-finalize')
      .send({
        login_session_key: '2b2aa099-4323-44e8-bb07-0b9b55dbe1dc',
        client_session_proof: 'wrong-proof'
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(403)
      .then(response => {
        
      });
  });
});

describe('POST /users/two-factor-configure', function() {
  it('should configure two factor and return otpauth_url', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/two-factor-configure')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenTwoFactorConfigure)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('otpauth_url');
      });
  });

  it('should return 401 unauthorized, no jwt provided', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/two-factor-configure')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(401)
      .then(response => {
        
      });
  });
});

describe('POST /users/two-factor-enable', function() {
  it('should enable two factor', function() {
    var twoFactorSecret = 'N5VTSUKVNBUDKZZFKQZUU2BEJ4SHMYZGNBAE652TO5HWQZ2VPV2Q';
    const speakeasy = require('speakeasy');
    
    var token = speakeasy.totp({
      secret: twoFactorSecret
    });

    return request(TEST_BACKEND_APP)
      .post('/users/two-factor-enable')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenTwoFactorEnable)
      .send({
        two_factor_code: token
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('two_factor_enabled', true);
      });
  });

  it('should not enable two factor, wrong token', function() {
    var twoFactorSecret = 'wrong-secret';
    const speakeasy = require('speakeasy');
    
    var token = speakeasy.totp({
      secret: twoFactorSecret,
      encoding: 'base32'
    });

    return request(TEST_BACKEND_APP)
      .post('/users/two-factor-enable')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenTwoFactorEnable)
      .send({
        two_factor_code: token
      })
      .expect('Content-Type', /json/)
      .expect(403)
      .then(response => {

      });
  });
});

describe('POST /users/login-two-factor', function() {
  it('should return access_token and refresh_token', function() {
    var twoFactorSecret = 'N5VTSUKVNBUDKZZFKQZUU2BEJ4SHMYZGNBAE652TO5HWQZ2VPV2Q';

    const speakeasy = require('speakeasy');

    var token = speakeasy.totp({
      secret: twoFactorSecret
    });

    var userAgent = 'my-browser-is-awesome';

    return request(TEST_BACKEND_APP)
      .post('/users/login-two-factor')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtTwoFactorToken)
      .set('user-agent', userAgent)
      .send({
        two_factor_code: token
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('access_token');
        response.body.should.have.property('refresh_token');
        response.body.should.have.property('device_id');
        response.body.should.have.property('rsa_encrypted_private_key');
        response.body.should.have.property('ecdsa_encrypted_private_key');
        
        console.log(response.body);
      });
  });

  it('should return 403 error, invalid token', function() {
    var twoFactorSecret = 'wrong-secret';

    const speakeasy = require('speakeasy');

    var token = speakeasy.totp({
      secret: twoFactorSecret,
      encoding: 'base32'
    });

    return request(TEST_BACKEND_APP)
      .post('/users/login-two-factor')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtTwoFactorToken)
      .send({
        two_factor_code: token
      })
      .expect('Content-Type', /json/)
      .expect(403)
      .then(response => {

      });
  });

  it('should return 401 error, unauthorized (no jwt)', function() {
    var twoFactorSecret = 'wrong-secret';

    const speakeasy = require('speakeasy');

    var token = speakeasy.totp({
      secret: twoFactorSecret,
      encoding: 'base32'
    });

    return request(TEST_BACKEND_APP)
      .post('/users/login-two-factor')
      .set('Accept', 'application/json')
      .send({
        two_factor_code: token
      })
      .expect('Content-Type', /json/)
      .expect(401)
      .then(response => {

      });
  });
});

describe('GET /users/access-token', function() {
  
  it('should return a new access token', function() {
    
    var userAgent = 'my-browser-is-awesome';

    return request(TEST_BACKEND_APP)
      .get('/users/access-token')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtRefreshToken)
      .set('user-agent', userAgent)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('access_token');
      });
  });

  it('should return 401, wrong user agent', function() {
    
    var userAgent = 'my-user-agent-is-wrong';

    return request(TEST_BACKEND_APP)
      .get('/users/access-token')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtRefreshToken)
      .set('user-agent', userAgent)
      .expect('Content-Type', /json/)
      .expect(401)
      .then(response => {
        
      });
  });

  it('should return 401, wrong jwt', function() {
    
    var userAgent = 'my-user-agent-is-wrong';

    return request(TEST_BACKEND_APP)
      .get('/users/access-token')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenTwoFactorEnable)
      .set('user-agent', userAgent)
      .expect('Content-Type', /json/)
      .expect(401)
      .then(response => {
        
      });
  });

});

describe('PATCH /users/me', function() {
  it('should update user account', function() {
    return request(TEST_BACKEND_APP)
      .patch('/users/me')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        name: 'my new name'
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('name', 'my new name');
      });
  });

  it('should update user email and send email', function() {
    return request(TEST_BACKEND_APP)
      .patch('/users/me')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'new-email@gladysproject.com'
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('email', 'new-email@gladysproject.com');
        response.body.should.have.property('email_confirmed', false);
      });
  });
});

describe('GET /users/me', function() {
  it('should get user account', function() {
    return request(TEST_BACKEND_APP)
      .get('/users/me')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, 
          { id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
            name: 'Tony',
            email: 'email-confirmed-two-factor-enabled@gladysprojet.com',
            role: 'admin',
            superAdmin: false,
            language: 'en',
            profile_url: null,
            gladys_user_id: null
          });
      });
  });
});

describe('POST /users/forgot-password', function() {
  it('should return success', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/forgot-password')
      .set('Accept', 'application/json')
      .send({
        email: 'email-confirmed-two-factor-enabled@gladysprojet.com'
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, {
          success: true
        });
      });
  });

  it('should return 404', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/forgot-password')
      .set('Accept', 'application/json')
      .send({
        email: 'this-email-does-not-exist@gladysproject.com'
      })
      .expect('Content-Type', /json/)
      .expect(404)
      .then(response => {

      });
  });
});

describe('POST /users/reset-password', function() {
  var twoFactorSecret = 'N5VTSUKVNBUDKZZFKQZUU2BEJ4SHMYZGNBAE652TO5HWQZ2VPV2Q';

  const speakeasy = require('speakeasy');

  var twoFactorCode = speakeasy.totp({
    secret: twoFactorSecret
  });

  it('should return success', function() {

    return request(TEST_BACKEND_APP)
      .post('/users/reset-password')
      .set('Accept', 'application/json')
      .send({
        token: 'd295b5bcc79c7951a95c24a719a778b6dc18334a9fe175a2807513d6e4d1b9a849fad6fab13adc00cf094636c5ad62263a0469d19447a42a82bd729f8c8e7b07',
        srp_salt: 'salt',
        srp_verifier: 'verifier',
        rsa_public_key: 'pubkey',
        ecdsa_public_key: 'pubkey',
        rsa_encrypted_private_key: 'encrypted-private-key',
        ecdsa_encrypted_private_key: 'encrypted-private-key',
        two_factor_code: twoFactorCode
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, {
          success: true
        });
      });
  });

  it('should return 422, missing srp_salt', function() {

    return request(TEST_BACKEND_APP)
      .post('/users/reset-password')
      .set('Accept', 'application/json')
      .send({
        token: 'd295b5bcc79c7951a95c24a719a778b6dc18334a9fe175a2807513d6e4d1b9a849fad6fab13adc00cf094636c5ad62263a0469d19447a42a82bd729f8c8e7b07',
        srp_verifier: 'verifier',
        rsa_public_key: 'pubkey',
        ecdsa_public_key: 'pubkey',
        rsa_encrypted_private_key: 'encrypted-private-key',
        ecdsa_encrypted_private_key: 'encrypted-private-key',
        two_factor_code: twoFactorCode
      })
      .expect('Content-Type', /json/)
      .expect(422)
      .then(response => {
        
      });
  });

  it('should return 404, token expired', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/reset-password')
      .set('Accept', 'application/json')
      .send({
        token: '237078dab6815cf2a13b8af3c97d979394b928e5be7b2e9fcb1ac1a8645acf33d9ed9965560ea90cc1e1fde5fedd5041fec41b0e2a986d50cfa9314f183d740b',
        srp_salt: 'salt',
        srp_verifier: 'verifier',
        rsa_public_key: 'pubkey',
        ecdsa_public_key: 'pubkey',
        rsa_encrypted_private_key: 'encrypted-private-key',
        ecdsa_encrypted_private_key: 'encrypted-private-key',
        two_factor_code: twoFactorCode
      })
      .expect('Content-Type', /json/)
      .expect(404)
      .then(response => {
        
      });
  });

  it('should return 404, wrong token', function() {
    return request(TEST_BACKEND_APP)
      .post('/users/reset-password')
      .set('Accept', 'application/json')
      .send({
        token: 'wrong-token',
        srp_salt: 'salt',
        srp_verifier: 'verifier',
        rsa_public_key: 'pubkey',
        ecdsa_public_key: 'pubkey',
        rsa_encrypted_private_key: 'encrypted-private-key',
        ecdsa_encrypted_private_key: 'encrypted-private-key',
        two_factor_code: twoFactorCode
      })
      .expect('Content-Type', /json/)
      .expect(404)
      .then(response => {
        
      });
  });
});


describe('GET /users/reset-password/:token', function() {
  var token = 'd295b5bcc79c7951a95c24a719a778b6dc18334a9fe175a2807513d6e4d1b9a849fad6fab13adc00cf094636c5ad62263a0469d19447a42a82bd729f8c8e7b07';
  
  it('should return email of the user', function() {
    return request(TEST_BACKEND_APP)
      .get('/users/reset-password/' + token)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, {
          id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
          email: 'email-confirmed-two-factor-enabled@gladysprojet.com',
          two_factor_enabled: true
        });
      });
  });

});

describe('GET /users/setup', function() {
  it('should get setup state', function() {
    return request(TEST_BACKEND_APP)
      .get('/users/setup')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        should.deepEqual(response.body, { 
          billing_setup: false,
          gladys_instance_setup: true,
          user_gladys_acccount_linked: false
        });
      });
  });
});

describe('GET /users/two-factor/new', function() {
  it('should generate new two factor secret', function() {
    return request(TEST_BACKEND_APP)
      .get('/users/two-factor/new')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('otpauth_url');
      });
  });
});

describe('PATCH /users/two-factor', function() {
  it('should update two factor', function() {

    const speakeasy = require('speakeasy');

    var secret = speakeasy.generateSecret();

    var twoFactorCode = speakeasy.totp({
      secret: secret.base32
    });

    return request(TEST_BACKEND_APP)
      .patch('/users/two-factor')
      .send({
        two_factor_secret: secret.base32,
        two_factor_code: twoFactorCode
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        response.body.should.have.property('two_factor_enabled', true);
      });
  });
});