const request = require('supertest');
const { expect } = require('chai');
const crypto = require('crypto');
const configTest = require('../../../tasks/config');

describe('POST /invitations', () => {
  it('should send invitation', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/invitations')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'pepper.potts@starkindustries.com',
        role: 'user',
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.deep.equal({
      id: response.body.id,
      email: 'pepper.potts@starkindustries.com',
      role: 'user',
      account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      gladys_4_user_id: null,
      is_invitation: true,
      created_at: response.body.created_at,
    });
  });

  it('should store invitation email in lowercase', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/invitations')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'Pepper.Potts.Mixed@StarkIndustries.com',
        role: 'user',
      })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.email).to.equal('pepper.potts.mixed@starkindustries.com');

    const invitation = await TEST_DATABASE_INSTANCE.t_invitation.findOne({
      id: response.body.id,
    });
    expect(invitation.email).to.equal('pepper.potts.mixed@starkindustries.com');
  });

  it('should send invitation for a Gladys user of the instance', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/invitations')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'happy.hogan@starkindustries.com',
        role: 'user',
        gladys_4_user_id: 'df033006-ee42-4b94-a324-3f558171c493',
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.include({
      email: 'happy.hogan@starkindustries.com',
      role: 'user',
      gladys_4_user_id: 'df033006-ee42-4b94-a324-3f558171c493',
      is_invitation: true,
    });
    const invitation = await TEST_DATABASE_INSTANCE.t_invitation.findOne({ id: response.body.id });
    expect(invitation.gladys_4_user_id).to.equal('df033006-ee42-4b94-a324-3f558171c493');
  });

  it('should send invitation without Gladys user (null)', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/invitations')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'happy.hogan@starkindustries.com',
        role: 'user',
        gladys_4_user_id: null,
      })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body.gladys_4_user_id).to.equal(null);
  });

  it('should not send invitation, gladys_4_user_id is a uuid in a form PostgreSQL rejects', () =>
    request(TEST_BACKEND_APP)
      .post('/invitations')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'happy.hogan@starkindustries.com',
        role: 'user',
        gladys_4_user_id: 'df033006:ee42:4b94:a324:3f558171c493',
      })
      .expect('Content-Type', /json/)
      .expect(422));

  it('should not send invitation, gladys_4_user_id is not a uuid', () =>
    request(TEST_BACKEND_APP)
      .post('/invitations')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'happy.hogan@starkindustries.com',
        role: 'user',
        gladys_4_user_id: 'not-a-uuid',
      })
      .expect('Content-Type', /json/)
      .expect(422));

  it('should not send invitation, an invitation is already pending for this Gladys user', () =>
    request(TEST_BACKEND_APP)
      .post('/invitations')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'happy.hogan@starkindustries.com',
        role: 'user',
        // the fixture invitation is pending for this Gladys user
        gladys_4_user_id: '5a1f2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b',
      })
      .expect('Content-Type', /json/)
      .expect(409));

  it('should not send invitation, a user is already linked to this Gladys user', async () => {
    // the user of jwtAccessTokenDashboard, linked to a Gladys user
    await TEST_DATABASE_INSTANCE.t_user.update(
      { id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' },
      { gladys_4_user_id: '7b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a8b' },
    );
    await request(TEST_BACKEND_APP)
      .post('/invitations')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'happy.hogan@starkindustries.com',
        role: 'user',
        gladys_4_user_id: '7b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a8b',
      })
      .expect('Content-Type', /json/)
      .expect(409);
  });

  it('should not send invitation, wrong email', () =>
    request(TEST_BACKEND_APP)
      .post('/invitations')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        email: 'pepper.pott',
      })
      .expect('Content-Type', /json/)
      .expect(422)
      .then((response) => {}));
});

describe('POST /invitations/accept', () => {
  it('should accept invitation', () =>
    request(TEST_BACKEND_APP)
      .post('/invitations/accept')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        token:
          'b429430dfc4c1765ae97b15a76bd41fcef8f58ddf6c1bd19bce034cadc45b88f0a5f45f2f00fe0809aa5dcb8947bd8eb86a177609785d8d73e498b444b534413',
        name: 'Tony',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
      })
      .expect('Content-Type', /json/)
      .expect(201)
      .then((response) => {
        expect(response.body).to.deep.equal({
          status: 201,
          message: 'User created with success.',
        });
      }));

  it('should link the user created from an invitation sent for a Gladys user', async () => {
    const token = 'token-of-the-invitation-sent-for-a-gladys-user';
    await request(TEST_BACKEND_APP)
      .post('/invitations/accept')
      .set('Accept', 'application/json')
      .send({
        token,
        name: 'Happy',
        language: 'en',
        // ignored: the invitation decides which Gladys user the new user is linked to
        gladys_4_user_id: '00000000-0000-4000-8000-000000000000',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
      })
      .expect('Content-Type', /json/)
      .expect(201);

    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({
      email: 'invitedforgladysuser@gladysassistant.com',
    });
    expect(user.gladys_4_user_id).to.equal('5a1f2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b');
    expect(user.account_id).to.equal('b2d23f66-487d-493f-8acb-9c8adb400def');
  });

  it('should not accept an invitation whose Gladys user was taken by another user meanwhile', async () => {
    await TEST_DATABASE_INSTANCE.t_user.update(
      { id: '3b69f1c5-d36c-419d-884c-50b9dd6e33e4' },
      { gladys_4_user_id: '5a1f2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b' },
    );
    await request(TEST_BACKEND_APP)
      .post('/invitations/accept')
      .set('Accept', 'application/json')
      .send({
        token: 'token-of-the-invitation-sent-for-a-gladys-user',
        name: 'Happy',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
      })
      .expect('Content-Type', /json/)
      .expect(409);
    // nothing was written: the invitation is still pending, the user does not exist
    const invitation = await TEST_DATABASE_INSTANCE.t_invitation.findOne({
      id: 'c5d3a6e0-7b1f-4c2e-9a8d-2f4b6e8a1c3d',
    });
    expect(invitation.accepted).to.equal(false);
    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({ email: 'invitedforgladysuser@gladysassistant.com' });
    expect(user).to.equal(null);
  });

  it('should store accepted invitation email in lowercase even if invitation has mixed case', async () => {
    const token =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await TEST_DATABASE_INSTANCE.t_invitation.insert({
      account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      email: 'Mixed.Case.User@Example.com',
      role: 'admin',
      token_hash: tokenHash,
      accepted: false,
      revoked: false,
    });

    await request(TEST_BACKEND_APP)
      .post('/invitations/accept')
      .set('Accept', 'application/json')
      .send({
        token,
        name: 'Mixed Case',
        language: 'fr',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
      })
      .expect('Content-Type', /json/)
      .expect(201);

    const user = await TEST_DATABASE_INSTANCE.t_user.findOne({
      email: 'mixed.case.user@example.com',
    });
    expect(user).to.be.an('object');
    expect(user.email).to.equal('mixed.case.user@example.com');
  });

  it('should not accept invitation, not found hash', () =>
    request(TEST_BACKEND_APP)
      .post('/invitations/accept')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        token: 'not-found-hash',
        name: 'Tony',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
      })
      .expect('Content-Type', /json/)
      .expect(404)
      .then((response) => {}));

  it('should not accept invitation, missing data', () =>
    request(TEST_BACKEND_APP)
      .post('/invitations/accept')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({
        token:
          'b429430dfc4c1765ae97b15a76bd41fcef8f58ddf6c1bd19bce034cadc45b88f0a5f45f2f00fe0809aa5dcb8947bd8eb86a177609785d8d73e498b444b534413',
        language: 'en',
        srp_salt: 'sfds',
        srp_verifier: 'dfdf',
        rsa_public_key: 'public-key',
        rsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
        ecdsa_public_key: 'public-key',
        ecdsa_encrypted_private_key: 'this-is-the-encrypted-private-key',
      })
      .expect('Content-Type', /json/)
      .expect(422)
      .then((response) => {}));
});

describe('GET /invitations/:id', () => {
  it('should get invitation', () =>
    request(TEST_BACKEND_APP)
      .get(
        '/invitations/b429430dfc4c1765ae97b15a76bd41fcef8f58ddf6c1bd19bce034cadc45b88f0a5f45f2f00fe0809aa5dcb8947bd8eb86a177609785d8d73e498b444b534413',
      )
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        expect(response.body).to.deep.equal({
          email: 'oneuserinvited@gladysassistant.com',
          id: 'b141f826-5e43-4aa6-807e-a37d4e9177de',
        });
      }));
});

describe('PATCH /invitations/:id', () => {
  it('should link a pending invitation to a Gladys user', async () => {
    const response = await request(TEST_BACKEND_APP)
      .patch('/invitations/b141f826-5e43-4aa6-807e-a37d4e9177de')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({ gladys_4_user_id: 'df033006-ee42-4b94-a324-3f558171c493' })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.include({
      id: 'b141f826-5e43-4aa6-807e-a37d4e9177de',
      email: 'oneuserinvited@gladysassistant.com',
      gladys_4_user_id: 'df033006-ee42-4b94-a324-3f558171c493',
      is_invitation: true,
    });
    expect(response.body).to.not.have.property('token_hash');
    const invitation = await TEST_DATABASE_INSTANCE.t_invitation.findOne({
      id: 'b141f826-5e43-4aa6-807e-a37d4e9177de',
    });
    expect(invitation.gladys_4_user_id).to.equal('df033006-ee42-4b94-a324-3f558171c493');
  });

  it('should unlink a pending invitation', async () => {
    const response = await request(TEST_BACKEND_APP)
      .patch('/invitations/c5d3a6e0-7b1f-4c2e-9a8d-2f4b6e8a1c3d')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({ gladys_4_user_id: null })
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body.gladys_4_user_id).to.equal(null);
  });

  it('should keep the link when the same Gladys user is set again on the same invitation', () =>
    request(TEST_BACKEND_APP)
      .patch('/invitations/c5d3a6e0-7b1f-4c2e-9a8d-2f4b6e8a1c3d')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({ gladys_4_user_id: '5a1f2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b' })
      .expect(200));

  it('should not link an invitation to a Gladys user another pending invitation is for', () =>
    request(TEST_BACKEND_APP)
      .patch('/invitations/b141f826-5e43-4aa6-807e-a37d4e9177de')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({ gladys_4_user_id: '5a1f2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b' })
      .expect('Content-Type', /json/)
      .expect(409));

  it('should not link an invitation to a Gladys user already linked to a user', async () => {
    await TEST_DATABASE_INSTANCE.t_user.update(
      { id: '3b69f1c5-d36c-419d-884c-50b9dd6e33e4' },
      { gladys_4_user_id: '7b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a8b' },
    );
    await request(TEST_BACKEND_APP)
      .patch('/invitations/b141f826-5e43-4aa6-807e-a37d4e9177de')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({ gladys_4_user_id: '7b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a8b' })
      .expect('Content-Type', /json/)
      .expect(409);
  });

  it('should return 422 when gladys_4_user_id is not a uuid', () =>
    request(TEST_BACKEND_APP)
      .patch('/invitations/b141f826-5e43-4aa6-807e-a37d4e9177de')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({ gladys_4_user_id: 'not-a-uuid' })
      .expect('Content-Type', /json/)
      .expect(422));

  it('should return 404 for an invitation which is not pending in the account', () =>
    request(TEST_BACKEND_APP)
      .patch('/invitations/00000000-0000-4000-8000-000000000000')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({ gladys_4_user_id: 'df033006-ee42-4b94-a324-3f558171c493' })
      .expect('Content-Type', /json/)
      .expect(404));

  it('should return 403 when the user is not admin', async () => {
    await TEST_DATABASE_INSTANCE.t_user.update({ id: 'a139e4a6-ec6c-442d-9730-0499155d38d4' }, { role: 'user' });
    await request(TEST_BACKEND_APP)
      .patch('/invitations/b141f826-5e43-4aa6-807e-a37d4e9177de')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .send({ gladys_4_user_id: 'df033006-ee42-4b94-a324-3f558171c493' })
      .expect('Content-Type', /json/)
      .expect(403);
  });
});

describe('POST /invitations/:id/revoke', () => {
  it('should revoke invitation', () =>
    request(TEST_BACKEND_APP)
      .post('/invitations/b141f826-5e43-4aa6-807e-a37d4e9177de/revoke')
      .set('Accept', 'application/json')
      .set('Authorization', configTest.jwtAccessTokenDashboard)
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        expect(response.body).to.deep.equal({
          success: true,
        });
      }));
});
