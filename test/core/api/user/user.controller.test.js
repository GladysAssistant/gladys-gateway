const request = require('supertest');
const speakeasy = require('speakeasy');
const jwt = require('jsonwebtoken');
const { expect } = require('chai');
const configTest = require('../../../tasks/config');
const srpFixture = require('../../../tasks/srp-fixture.json');

describe('POST /users/signup', () => {
  it('should signup one user', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/users/signup')
      .send({
        name: 'Tony',
        email: 'tony.stark@gladysassistant.com',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(201);

    expect(response.body).to.deep.equal({
      status: 201,
      message: 'User created with success. You need now to confirm your email.',
    });
  });

  it('should store signup email in lowercase', async () => {
    await request(TEST_BACKEND_APP)
      .post('/users/signup')
      .send({
        name: 'Tony',
        email: 'Tony.Stark.Mixed@GladysAssistant.com',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(201);

    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({
      email: 'tony.stark.mixed@gladysassistant.com',
    });
    expect(user).to.not.equal(null);
    expect(user.email).to.equal('tony.stark.mixed@gladysassistant.com');
  });

  it('should not signup user, missing attributes', async () => {
    await request(TEST_BACKEND_APP)
      .post('/users/signup')
      .send({
        email: 'tony.stark@gladysassistant.com',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(422);
  });
});

describe('POST /users/verify', () => {
  it('should verify one user email', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/users/verify')
      .send({
        email_confirmation_token:
          '0fbb7645bf4e9f6ed9f767b9957a57dc79fd828792374d3c91359054e1858e067f498e4479369e4b4fee4514be6ba14699805a33dbc6fb6f9b264d02772eacf9',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).to.deep.equal({
      id: '29770e0d-26a9-444e-91a1-f175c99a5218',
      email: 'tony.stark@gladysassistant.com',
      email_confirmed: true,
    });
  });
});

describe('POST /users/login-salt', () => {
  it('should return a salt', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-salt')
      .send({
        email: 'email-confirmed@gladysprojet.com',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, {
          srp_salt: 'e0812f8c57be08780bafcc7e2cbacd155b6f63962114c12cc12462a7aa669fdb',
        });
      }));
  it('should return a salt when email casing differs', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-salt')
      .send({
        email: 'Email-Confirmed@GladysProjet.com',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, {
          srp_salt: 'e0812f8c57be08780bafcc7e2cbacd155b6f63962114c12cc12462a7aa669fdb',
        });
      }));
  it('should return 404 not found', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-salt')
      .send({
        email: 'this-email-doesnt-exist@gladysprojet.com',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(404)
      .then((response) => {}));
});

describe('POST /users/login-generate-ephemeral', () => {
  it('should return a salt', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-generate-ephemeral')
      .send({
        email: 'email-confirmed@gladysprojet.com',
        client_ephemeral_public: 'heyheyhey',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('server_ephemeral_public');
        response.body.should.have.property('login_session_key');
      }));
  it('should return 404 not found', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-generate-ephemeral')
      .send({
        email: 'this-email-doesnt-exist@gladysprojet.com',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(404)
      .then((response) => {}));
});

describe('POST /users/login-finalize', () => {
  it('should return a server_session_proof and access_token', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-finalize')
      .send({
        login_session_key: '2b2aa099-4323-44e8-bb07-0b9b55dbe1dc',
        client_session_proof: srpFixture.clientSession.proof,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('server_session_proof');
        response.body.should.have.property('access_token');
      }));

  it('should return 403 forbidden. Wrong client proof', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-finalize')
      .send({
        login_session_key: '2b2aa099-4323-44e8-bb07-0b9b55dbe1dc',
        client_session_proof: 'wrong-proof',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(403)
      .then((response) => {}));
});

describe('POST /users/two-factor-configure', () => {
  it('should configure two factor and return otpauth_url', () =>
    request(TEST_BACKEND_APP)
      .post('/users/two-factor-configure')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenTwoFactorConfigure)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('otpauth_url');
      }));

  it('should return 401 unauthorized, no jwt provided', () =>
    request(TEST_BACKEND_APP)
      .post('/users/two-factor-configure')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(401)
      .then((response) => {}));
});

describe('POST /users/two-factor-enable', () => {
  it('should enable two factor', () => {
    const twoFactorSecret = 'N5VTSUKVNBUDKZZFKQZUU2BEJ4SHMYZGNBAE652TO5HWQZ2VPV2Q';

    const token = speakeasy.totp({
      secret: twoFactorSecret,
    });

    return request(TEST_BACKEND_APP)
      .post('/users/two-factor-enable')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenTwoFactorEnable)
      .send({
        two_factor_code: token,
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('two_factor_enabled', true);
      });
  });

  it('should not enable two factor, wrong token', () => {
    const twoFactorSecret = 'wrong-secret';

    const token = speakeasy.totp({
      secret: twoFactorSecret,
      encoding: 'base32',
    });

    return request(TEST_BACKEND_APP)
      .post('/users/two-factor-enable')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenTwoFactorEnable)
      .send({
        two_factor_code: token,
      })
      .expect('Content-Type', /json/)
      .expect(403)
      .then((response) => {});
  });
});

describe('POST /users/login-two-factor', () => {
  it('should return access_token and refresh_token', async () => {
    const twoFactorSecret = 'N5VTSUKVNBUDKZZFKQZUU2BEJ4SHMYZGNBAE652TO5HWQZ2VPV2Q';
    const token = speakeasy.totp({ secret: twoFactorSecret });
    const userAgent = 'my-browser-is-awesome';

    const response = await request(TEST_BACKEND_APP)
      .post('/users/login-two-factor')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtTwoFactorToken)
      .set('user-agent', userAgent)
      .send({ two_factor_code: token })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).to.have.property('access_token');
    expect(response.body).to.have.property('refresh_token');
    expect(response.body).to.have.property('device_id');
    expect(response.body).to.have.property('rsa_encrypted_private_key');
    expect(response.body).to.have.property('ecdsa_encrypted_private_key');
    expect(response.body).to.have.property('encrypted_backup_key');
    expect(response.body).to.have.property('gladys_4_user_id');
  });

  it('should return 403 error, invalid token', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-two-factor')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtTwoFactorToken)
      .send({
        two_factor_code: 'wrong-token',
      })
      .expect('Content-Type', /json/)
      .expect(403)
      .then((response) => {}));

  it('should return 401 error, unauthorized (no jwt)', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-two-factor')
      .set('Accept', 'application/json')
      .send({
        two_factor_code: 'wrong-token',
      })
      .expect('Content-Type', /json/)
      .expect(401)
      .then((response) => {}));
});

describe('POST /users/two-factor/recovery-codes', () => {
  it('should generate 10 recovery codes', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/users/two-factor/recovery-codes')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).to.have.property('recovery_codes');
    expect(response.body.recovery_codes).to.have.lengthOf(10);
    response.body.recovery_codes.forEach((recoveryCode) => {
      expect(recoveryCode).to.match(/^([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
    });

    // all codes should be different
    expect(new Set(response.body.recovery_codes).size).to.equal(10);

    // only hashes of the codes should be stored in database
    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({
      id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
    });
    expect(user.two_factor_recovery_codes).to.have.lengthOf(10);
    response.body.recovery_codes.forEach((recoveryCode) => {
      expect(user.two_factor_recovery_codes).to.not.include(recoveryCode);
    });
  });

  it('should return 403 when two factor is not enabled', async () => {
    const accessToken = jwt.sign(
      { user_id: 'bdb1a902-a65e-46f9-8c2a-5c09840e2e10', scope: ['dashboard:read', 'dashboard:write'] },
      process.env.JWT_ACCESS_TOKEN_SECRET,
      { algorithm: 'HS256', audience: 'user', issuer: 'gladys-gateway', expiresIn: 60 * 60 },
    );

    await request(TEST_BACKEND_APP)
      .post('/users/two-factor/recovery-codes')
      .set('Accept', 'application/json')
      .set('Authorization', accessToken)
      .expect('Content-Type', /json/)
      .expect(403);
  });

  it('should return 401 unauthorized, no jwt provided', () =>
    request(TEST_BACKEND_APP)
      .post('/users/two-factor/recovery-codes')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(401));
});

describe('POST /users/login-recovery-code', () => {
  it('should return access_token and refresh_token, and consume the recovery code', async () => {
    const userAgent = 'my-browser-is-awesome';

    const response = await request(TEST_BACKEND_APP)
      .post('/users/login-recovery-code')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtTwoFactorToken)
      .set('user-agent', userAgent)
      .send({ two_factor_recovery_code: '1a2b3-c4d5e', device_name: 'my-device' })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).to.have.property('access_token');
    expect(response.body).to.have.property('refresh_token');
    expect(response.body).to.have.property('device_id');
    expect(response.body).to.have.property('rsa_encrypted_private_key');
    expect(response.body).to.have.property('ecdsa_encrypted_private_key');
    expect(response.body).to.have.property('encrypted_backup_key');
    expect(response.body).to.have.property('gladys_4_user_id');

    // the recovery code should have been consumed
    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({
      id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
    });
    expect(user.two_factor_recovery_codes).to.have.lengthOf(1);

    // a recovery code is single-use
    await request(TEST_BACKEND_APP)
      .post('/users/login-recovery-code')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtTwoFactorToken)
      .set('user-agent', userAgent)
      .send({ two_factor_recovery_code: '1a2b3-c4d5e', device_name: 'my-device' })
      .expect('Content-Type', /json/)
      .expect(403);
  });

  it('should accept a recovery code entered with different formatting', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-recovery-code')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtTwoFactorToken)
      .set('user-agent', 'my-browser-is-awesome')
      .send({ two_factor_recovery_code: 'F6A7B 8C9D0', device_name: 'my-device' })
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        expect(response.body).to.have.property('access_token');
      }));

  it('should only accept one recovery code when the same code is used twice concurrently', async () => {
    const sendRecoveryCodeLogin = () =>
      request(TEST_BACKEND_APP)
        .post('/users/login-recovery-code')
        .set('Accept', 'application/json')
        .set('Authorization', configTest.jwtTwoFactorToken)
        .set('user-agent', 'my-browser-is-awesome')
        .send({ two_factor_recovery_code: '1a2b3-c4d5e', device_name: 'my-device' });

    const responses = await Promise.all([sendRecoveryCodeLogin(), sendRecoveryCodeLogin()]);
    const statusCodes = responses.map((response) => response.status).sort();

    expect(statusCodes).to.deep.equal([200, 403]);

    // only one device should have been created
    const devices = await TEST_DATABASE_INSTANCE.t_device.find({
      user_id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
      name: 'my-device',
    });
    expect(devices).to.have.lengthOf(1);
  });

  it('should not consume the recovery code if the session cannot be created', async () => {
    await request(TEST_BACKEND_APP)
      .post('/users/login-recovery-code')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtTwoFactorToken)
      .unset('User-Agent')
      .send({ two_factor_recovery_code: '1a2b3-c4d5e', device_name: 'my-device' })
      .expect(500);

    // the recovery code should not have been consumed
    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({
      id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
    });
    expect(user.two_factor_recovery_codes).to.have.lengthOf(2);

    // no device should have been created
    const devices = await TEST_DATABASE_INSTANCE.t_device.find({
      user_id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
      name: 'my-device',
    });
    expect(devices).to.have.lengthOf(0);
  });

  it('should return 403 when two factor is not enabled', () => {
    const twoFactorToken = jwt.sign(
      { user_id: 'bdb1a902-a65e-46f9-8c2a-5c09840e2e10', scope: ['two-factor'] },
      process.env.JWT_TWO_FACTOR_SECRET,
      { algorithm: 'HS256', issuer: 'gladys-gateway', expiresIn: 2 * 60 },
    );

    return request(TEST_BACKEND_APP)
      .post('/users/login-recovery-code')
      .set('Accept', 'application/json')
      .set('Authorization', twoFactorToken)
      .set('user-agent', 'my-browser-is-awesome')
      .send({ two_factor_recovery_code: '1a2b3-c4d5e', device_name: 'my-device' })
      .expect('Content-Type', /json/)
      .expect(403);
  });

  it('should return 403 error, invalid recovery code', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-recovery-code')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtTwoFactorToken)
      .send({ two_factor_recovery_code: 'wrong-code', device_name: 'my-device' })
      .expect('Content-Type', /json/)
      .expect(403));

  it('should return 401 error, unauthorized (no jwt)', () =>
    request(TEST_BACKEND_APP)
      .post('/users/login-recovery-code')
      .set('Accept', 'application/json')
      .send({ two_factor_recovery_code: '1a2b3-c4d5e', device_name: 'my-device' })
      .expect('Content-Type', /json/)
      .expect(401));
});

describe('GET /users/access-token', () => {
  it('should return a new access token', async () => {
    const userAgent = 'my-browser-is-awesome';

    const response = await request(TEST_BACKEND_APP)
      .get('/users/access-token')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtRefreshToken)
      .set('user-agent', userAgent)
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.have.property('access_token');
    expect(response.body).to.have.property('instances');
  });

  it('should return 401, wrong jwt', () =>
    request(TEST_BACKEND_APP)
      .get('/users/access-token')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenTwoFactorEnable)
      .set('user-agent', 'my-user-agent-is-wrong')
      .expect('Content-Type', /json/)
      .expect(401)
      .then((response) => {}));
});

describe('PATCH /users/me', () => {
  it('should update user account', () =>
    request(TEST_BACKEND_APP)
      .patch('/users/me')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        name: 'my new name',
        encrypted_backup_key: 'ENCRYPTED_BACKUP_KEY',
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('name', 'my new name');
      }));

  it('should update user email and send email', () =>
    request(TEST_BACKEND_APP)
      .patch('/users/me')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'new-email@gladysassistant.com',
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('email', 'new-email@gladysassistant.com');
        response.body.should.have.property('email_confirmed', false);
      }));
});

describe('GET /users/me', () => {
  it('should get user account', () =>
    request(TEST_BACKEND_APP)
      .get('/users/me')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, {
          id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
          name: 'Tony',
          email: 'email-confirmed-two-factor-enabled@gladysprojet.com',
          account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
          role: 'admin',
          superAdmin: false,
          language: 'en',
          plan: 'plus',
          status: 'active',
          profile_url: null,
          gladys_user_id: null,
          gladys_4_user_id: null,
          current_period_end: '2050-11-20T16:00:00.000Z',
        });
      }));
});

describe('POST /users/forgot-password', () => {
  it('should return success', () =>
    request(TEST_BACKEND_APP)
      .post('/users/forgot-password')
      .set('Accept', 'application/json')
      .send({
        email: 'email-confirmed-two-factor-enabled@gladysprojet.com',
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, {
          success: true,
        });
      }));

  it('should return success when email casing differs', () =>
    request(TEST_BACKEND_APP)
      .post('/users/forgot-password')
      .set('Accept', 'application/json')
      .send({
        email: 'Email-Confirmed-Two-Factor-Enabled@GladysProjet.com',
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, {
          success: true,
        });
      }));

  it('should return 404', () =>
    request(TEST_BACKEND_APP)
      .post('/users/forgot-password')
      .set('Accept', 'application/json')
      .send({
        email: 'this-email-does-not-exist@gladysassistant.com',
      })
      .expect('Content-Type', /json/)
      .expect(404)
      .then((response) => {}));
});

describe('POST /users/reset-password', () => {
  const twoFactorSecret = 'N5VTSUKVNBUDKZZFKQZUU2BEJ4SHMYZGNBAE652TO5HWQZ2VPV2Q';

  const twoFactorCode = speakeasy.totp({
    secret: twoFactorSecret,
  });

  it('should return success', () =>
    request(TEST_BACKEND_APP)
      .post('/users/reset-password')
      .set('Accept', 'application/json')
      .send({
        token:
          'd295b5bcc79c7951a95c24a719a778b6dc18334a9fe175a2807513d6e4d1b9a849fad6fab13adc00cf094636c5ad62263a0469d19447a42a82bd729f8c8e7b07',
        srp_salt: 'salt',
        srp_verifier: 'verifier',
        rsa_public_key: 'pubkey',
        ecdsa_public_key: 'pubkey',
        rsa_encrypted_private_key: 'encrypted-private-key',
        ecdsa_encrypted_private_key: 'encrypted-private-key',
        two_factor_code: twoFactorCode,
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, {
          success: true,
        });
      }));

  it('should reset password with a two factor recovery code', () =>
    request(TEST_BACKEND_APP)
      .post('/users/reset-password')
      .set('Accept', 'application/json')
      .send({
        token:
          'd295b5bcc79c7951a95c24a719a778b6dc18334a9fe175a2807513d6e4d1b9a849fad6fab13adc00cf094636c5ad62263a0469d19447a42a82bd729f8c8e7b07',
        srp_salt: 'salt',
        srp_verifier: 'verifier',
        rsa_public_key: 'pubkey',
        ecdsa_public_key: 'pubkey',
        rsa_encrypted_private_key: 'encrypted-private-key',
        ecdsa_encrypted_private_key: 'encrypted-private-key',
        two_factor_recovery_code: '1a2b3-c4d5e',
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, {
          success: true,
        });
      }));

  it('should return 403, invalid two factor recovery code', () =>
    request(TEST_BACKEND_APP)
      .post('/users/reset-password')
      .set('Accept', 'application/json')
      .send({
        token:
          'd295b5bcc79c7951a95c24a719a778b6dc18334a9fe175a2807513d6e4d1b9a849fad6fab13adc00cf094636c5ad62263a0469d19447a42a82bd729f8c8e7b07',
        srp_salt: 'salt',
        srp_verifier: 'verifier',
        rsa_public_key: 'pubkey',
        ecdsa_public_key: 'pubkey',
        rsa_encrypted_private_key: 'encrypted-private-key',
        ecdsa_encrypted_private_key: 'encrypted-private-key',
        two_factor_recovery_code: 'wrong-code',
      })
      .expect('Content-Type', /json/)
      .expect(403));

  it('should return 403, two factor recovery code is not a string', () =>
    request(TEST_BACKEND_APP)
      .post('/users/reset-password')
      .set('Accept', 'application/json')
      .send({
        token:
          'd295b5bcc79c7951a95c24a719a778b6dc18334a9fe175a2807513d6e4d1b9a849fad6fab13adc00cf094636c5ad62263a0469d19447a42a82bd729f8c8e7b07',
        srp_salt: 'salt',
        srp_verifier: 'verifier',
        rsa_public_key: 'pubkey',
        ecdsa_public_key: 'pubkey',
        rsa_encrypted_private_key: 'encrypted-private-key',
        ecdsa_encrypted_private_key: 'encrypted-private-key',
        two_factor_recovery_code: 12345,
      })
      .expect('Content-Type', /json/)
      .expect(403));

  it('should not consume the recovery code if the password reset fails', async () => {
    await request(TEST_BACKEND_APP)
      .post('/users/reset-password')
      .set('Accept', 'application/json')
      .send({
        token:
          'd295b5bcc79c7951a95c24a719a778b6dc18334a9fe175a2807513d6e4d1b9a849fad6fab13adc00cf094636c5ad62263a0469d19447a42a82bd729f8c8e7b07',
        srp_salt: 'salt',
        srp_verifier: 'verifier',
        rsa_public_key: 'pubkey',
        ecdsa_public_key: 'pubkey',
        rsa_encrypted_private_key: 'encrypted-private-key',
        ecdsa_encrypted_private_key: 'encrypted-private-key',
        two_factor_recovery_code: 'wrong-code',
      })
      .expect(403);

    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({
      id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
    });
    expect(user.two_factor_recovery_codes).to.have.lengthOf(2);
  });

  it('should return 422, missing srp_salt', () =>
    request(TEST_BACKEND_APP)
      .post('/users/reset-password')
      .set('Accept', 'application/json')
      .send({
        token:
          'd295b5bcc79c7951a95c24a719a778b6dc18334a9fe175a2807513d6e4d1b9a849fad6fab13adc00cf094636c5ad62263a0469d19447a42a82bd729f8c8e7b07',
        srp_verifier: 'verifier',
        rsa_public_key: 'pubkey',
        ecdsa_public_key: 'pubkey',
        rsa_encrypted_private_key: 'encrypted-private-key',
        ecdsa_encrypted_private_key: 'encrypted-private-key',
        two_factor_code: twoFactorCode,
      })
      .expect('Content-Type', /json/)
      .expect(422)
      .then((response) => {}));

  it('should return 404, token expired', () =>
    request(TEST_BACKEND_APP)
      .post('/users/reset-password')
      .set('Accept', 'application/json')
      .send({
        token:
          '237078dab6815cf2a13b8af3c97d979394b928e5be7b2e9fcb1ac1a8645acf33d9ed9965560ea90cc1e1fde5fedd5041fec41b0e2a986d50cfa9314f183d740b',
        srp_salt: 'salt',
        srp_verifier: 'verifier',
        rsa_public_key: 'pubkey',
        ecdsa_public_key: 'pubkey',
        rsa_encrypted_private_key: 'encrypted-private-key',
        ecdsa_encrypted_private_key: 'encrypted-private-key',
        two_factor_code: twoFactorCode,
      })
      .expect('Content-Type', /json/)
      .expect(404)
      .then((response) => {}));

  it('should return 404, wrong token', () =>
    request(TEST_BACKEND_APP)
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
        two_factor_code: twoFactorCode,
      })
      .expect('Content-Type', /json/)
      .expect(404)
      .then((response) => {}));
});

describe('GET /users/reset-password/:token', () => {
  const token =
    'd295b5bcc79c7951a95c24a719a778b6dc18334a9fe175a2807513d6e4d1b9a849fad6fab13adc00cf094636c5ad62263a0469d19447a42a82bd729f8c8e7b07';

  it('should return email of the user', () =>
    request(TEST_BACKEND_APP)
      .get(`/users/reset-password/${token}`)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, {
          id: 'a139e4a6-ec6c-442d-9730-0499155d38d4',
          email: 'email-confirmed-two-factor-enabled@gladysprojet.com',
          two_factor_enabled: true,
        });
      }));
});

describe('GET /users/setup', () => {
  it('should get setup state', () =>
    request(TEST_BACKEND_APP)
      .get('/users/setup')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        should.deepEqual(response.body, {
          billing_setup: false,
          stripe_portal_key: 'fee71731-5928-4f2f-a74b-c7858d39372f',
          gladys_instance_setup: true,
          user_gladys_acccount_linked: false,
        });
      }));
});

describe('GET /users/two-factor/new', () => {
  it('should generate new two factor secret', () =>
    request(TEST_BACKEND_APP)
      .get('/users/two-factor/new')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('otpauth_url');
      }));
});

describe('PATCH /users/two-factor', () => {
  it('should update two factor', () => {
    const secret = speakeasy.generateSecret();

    const twoFactorCode = speakeasy.totp({
      secret: secret.base32,
    });

    return request(TEST_BACKEND_APP)
      .patch('/users/two-factor')
      .send({
        two_factor_secret: secret.base32,
        two_factor_code: twoFactorCode,
      })
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        response.body.should.have.property('two_factor_enabled', true);
      });
  });
});
