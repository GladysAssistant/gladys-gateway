const Joi = require('joi');
const Promise = require('bluebird');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const uuid = require('uuid');
const srpServer = require('secure-remote-password/server');
const { ValidationError, AlreadyExistError, NotFoundError, ForbiddenError } = require('../../common/error');
const schema = require('../../common/schema');

const REDIS_LOGIN_SESSION_EXPIRY_IN_SECONDS = 120;
const resetPasswordTokenExpiryInMilliSeconds = 2 * 60 * 60 * 1000;

module.exports = function UserModel(logger, db, redisClient, jwtService, mailService) {
  /**
   * Create a new user with his email and language
   */
  async function signup(newUserParam) {
    const newUser = newUserParam;
    newUser.email = newUser.email.trim().toLowerCase();

    const { error, value } = Joi.validate(newUser, schema.signupSchema, {
      stripUnknown: true,
      abortEarly: false,
      presence: 'required',
    });

    if (error) {
      logger.debug(error);
      throw new ValidationError('user', error);
    }

    return db.withTransaction(async (tx) => {
      // we check that one user with this confirmed email does not already exist
      const userAlreadyExist = await tx.t_user.findOne(
        {
          email: newUser.email,
          email_confirmed: true,
          is_deleted: false,
        },
        { fields: ['id'] },
      );

      if (userAlreadyExist !== null) {
        logger.warn(`A user with that email already exist (${userAlreadyExist.id})`);
        throw new AlreadyExistError('user', newUser.email);
      }

      const newAccount = {
        name: value.email,
      };

      // create account in DB and set account_id to user object
      const insertedAccount = await tx.t_account.insert(newAccount);
      value.account_id = insertedAccount.id;

      // generate email confirmation token
      const emailConfirmationToken = (await randomBytes(64)).toString('hex');

      // we hash the token in DB so it's not possible to get the token if the DB is compromised in read-only
      // (due to SQL injection for example)
      value.email_confirmation_token_hash = crypto.createHash('sha256').update(emailConfirmationToken).digest('hex');

      // user signing up is admin
      value.role = 'admin';

      // set gravatar image for the user
      const emailHash = crypto.createHash('md5').update(value.email).digest('hex');
      value.profile_url = `https://www.gravatar.com/avatar/${emailHash}`;

      if (process.env.DEFAULT_USER_PROFILE_URL) {
        value.profile_url += `?d=${process.env.DEFAULT_USER_PROFILE_URL}`;
        value.profile_url = encodeURI(value.profile_url);
      }

      // we insert the user in db
      const insertedUser = await tx.t_user.insert(value);

      return {
        id: insertedUser.id,
        email: insertedUser.email,
        email_confirmation_token: emailConfirmationToken,
        profile_url: insertedUser.profile_url,
        language: insertedUser.language,
        account_id: insertedAccount.id,
      };
    });
  }

  async function getMySelf(user) {
    const users = await db.query(
      `
      SELECT t_user.id, t_user.name, t_user.email, t_user.role, t_user.language, 
      t_user.profile_url, t_user.gladys_user_id, t_user.gladys_4_user_id, t_user.account_id, 
      (t_account.current_period_end + interval '24 hour') as current_period_end 
      FROM t_user
      JOIN t_account ON t_user.account_id = t_account.id
      WHERE t_user.id = $1
    `,
      [user.id],
    );

    if (users.length === 0) {
      throw new NotFoundError('user_not_found');
    }

    const currentUser = users[0];

    currentUser.superAdmin = currentUser.id === process.env.SUPER_ADMIN_USER_ID;

    return currentUser;
  }

  async function updateUser(user, data) {
    const { error, value } = Joi.validate(data, schema.signupSchema, {
      stripUnknown: true,
      abortEarly: false,
      presence: 'optional',
    });

    if (error) {
      logger.debug(error);
      throw new ValidationError('user', error);
    }

    // we get the current user to see if his email has changed
    const currentUser = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'email'] },
    );

    let emailConfirmationToken;

    if (value.email) {
      value.email = value.email.trim().toLowerCase();

      if (value.email !== currentUser.email) {
        value.email_confirmed = false;

        // generate email confirmation token
        emailConfirmationToken = (await randomBytes(64)).toString('hex');

        // we hash the token in DB so it's not possible to get the token if the DB is compromised in read-only
        // (due to SQL injection for example)
        value.email_confirmation_token_hash = crypto.createHash('sha256').update(emailConfirmationToken).digest('hex');
      }
    }

    const updatedUser = await db.t_user.update(user.id, value, {
      fields: ['id', 'name', 'email', 'profile_url', 'email_confirmed', 'language'],
    });
    updatedUser.email_confirmation_token = emailConfirmationToken;
    return updatedUser;
  }

  async function confirmEmail(emailConfirmationToken) {
    // we hash the token again
    const confirmationTokenHash = crypto.createHash('sha256').update(emailConfirmationToken).digest('hex');

    // search for a user with this hash in database
    const user = await db.t_user.findOne(
      {
        is_deleted: false,
        email_confirmation_token_hash: confirmationTokenHash,
      },
      { fields: ['id'] },
    );

    // if user is not found, the token is wrong
    if (user === null) {
      throw new NotFoundError('Confirmation token not found');
    }

    const userUpdated = await db.t_user.update(
      user.id,
      {
        email_confirmed: true,
      },
      { fields: ['id', 'email', 'email_confirmed'] },
    );

    return userUpdated;
  }

  async function loginGetSalt({ email }) {
    const user = await db.t_user.findOne(
      {
        is_deleted: false,
        email_confirmed: true,
        email,
      },
      { fields: ['srp_salt'] },
    );

    if (user === null) {
      throw new NotFoundError('Email not found');
    }

    return user;
  }

  async function loginGenerateEphemeralValuePair(data) {
    // we retrieve the verifier from the database
    const user = await db.t_user.findOne(
      {
        is_deleted: false,
        email_confirmed: true,
        email: data.email,
      },
      { fields: ['id', 'email', 'srp_salt', 'srp_verifier', 'two_factor_enabled'] },
    );

    if (user === null) {
      throw new NotFoundError('Email not found');
    }

    const serverEphemeral = srpServer.generateEphemeral(user.srp_verifier);
    const loginSessionKey = uuid.v4();

    const loginSessionState = {
      serverEphemeral,
      user,
      clientEphemeralPublic: data.client_ephemeral_public,
    };

    await redisClient.set(`login_session:${loginSessionKey}`, JSON.stringify(loginSessionState), {
      EX: REDIS_LOGIN_SESSION_EXPIRY_IN_SECONDS,
    });

    return {
      server_ephemeral_public: serverEphemeral.public,
      login_session_key: loginSessionKey,
    };
  }

  async function loginDeriveSession(data) {
    const loginSessionState = await redisClient.get(`login_session:${data.login_session_key}`);

    if (loginSessionState === null) {
      throw new NotFoundError('Login session not found');
    }

    try {
      const loginSessionStateParsed = JSON.parse(loginSessionState);

      // try to deriveSession, it will throw an Error if the proof is not right
      const serverSession = srpServer.deriveSession(
        loginSessionStateParsed.serverEphemeral.secret,
        loginSessionStateParsed.clientEphemeralPublic,
        loginSessionStateParsed.user.srp_salt,
        loginSessionStateParsed.user.email,
        loginSessionStateParsed.user.srp_verifier,
        data.client_session_proof,
      );

      // if two factor is enabled, we only return a token that gives access
      // to the two factor verify route
      if (loginSessionStateParsed.user.two_factor_enabled) {
        const twoFactorToken = jwtService.generateTwoFactorToken(loginSessionStateParsed.user);

        return {
          server_session_proof: serverSession.proof,
          two_factor_token: twoFactorToken,
        };
      }

      // Otherwise, we send an access token only valid 1 hour so the user can enable two factor

      const accessToken = jwtService.generateAccessToken(loginSessionStateParsed.user, ['two-factor-configure']);

      return {
        server_session_proof: serverSession.proof,
        access_token: accessToken,
      };
    } catch (e) {
      throw new ForbiddenError();
    }
  }

  async function configureTwoFactor(user) {
    const fullUser = await db.t_user.findOne({
      id: user.id,
    });

    if (fullUser.two_factor_enabled === true) {
      throw new ForbiddenError('Two Factor Authentication is already enabled');
    }

    const secret = speakeasy.generateSecret();

    await db.t_user.update(user.id, {
      two_factor_secret: secret.base32,
    });

    const url = speakeasy.otpauthURL({
      secret: secret.base32,
      label: fullUser.email,
      issuer: 'Gladys Gateway',
    });

    return {
      otpauth_url: url,
    };
  }

  async function enableTwoFactor(user, twoFactorCode) {
    const userWithSecret = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'two_factor_secret', 'two_factor_enabled'] },
    );

    // two factor is already enabled
    if (userWithSecret.two_factor_enabled === true) {
      return {
        two_factor_enabled: true,
      };
    }

    const tokenValidates = speakeasy.totp.verify({
      secret: userWithSecret.two_factor_secret,
      token: twoFactorCode,
    });

    if (!tokenValidates) {
      throw new ForbiddenError();
    }

    await db.t_user.update(
      {
        id: user.id,
      },
      { two_factor_enabled: true },
    );

    return {
      two_factor_enabled: true,
    };
  }

  async function getNewTwoFactorSecret(user) {
    const fullUser = await db.t_user.findOne({
      id: user.id,
    });

    const secret = speakeasy.generateSecret();

    const url = speakeasy.otpauthURL({
      secret: secret.base32,
      label: fullUser.email,
      issuer: 'Gladys Gateway',
    });

    return {
      otpauth_url: url,
    };
  }

  async function updateTwoFactor(user, twoFactorSecret, twoFactorCode) {
    const tokenValidates = speakeasy.totp.verify({
      secret: twoFactorSecret,
      token: twoFactorCode,
    });

    if (!tokenValidates) {
      throw new ForbiddenError();
    }

    await db.t_user.update(
      {
        id: user.id,
      },
      {
        two_factor_enabled: true,
        two_factor_secret: twoFactorSecret,
      },
    );

    return {
      two_factor_enabled: true,
    };
  }

  async function loginTwoFactor(user, twoFactorCode, deviceName, userAgent) {
    const userWithSecret = await db.t_user.findOne(
      {
        id: user.id,
      },
      {
        fields: [
          'id',
          'two_factor_secret',
          'rsa_encrypted_private_key',
          'ecdsa_encrypted_private_key',
          'rsa_public_key',
          'ecdsa_public_key',
          'encrypted_backup_key',
          'gladys_4_user_id',
        ],
      },
    );

    const tokenValidates = speakeasy.totp.verify({
      secret: userWithSecret.two_factor_secret,
      token: twoFactorCode,
      window: 2,
    });

    if (!tokenValidates) {
      throw new ForbiddenError();
    }

    const newDevice = {
      id: uuid.v4(),
      name: deviceName,
      user_id: user.id,
    };

    const scope = ['dashboard:read', 'dashboard:write', 'two-factor-configure'];
    const userAgentHash = crypto.createHash('sha256').update(userAgent).digest('hex');

    const refreshToken = jwtService.generateRefreshToken(user, scope, newDevice.id, userAgentHash);
    const accessToken = jwtService.generateAccessToken(user, scope);

    // we save a hash of the refresh token so we can invalidate it after.
    // We don't want to save the refresh token in clear text because if an attacker get read access
    // to the DB (ex: SQL injection) he could get the token and use it for write use
    newDevice.refresh_token_hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    return db.withTransaction(async (tx) => {
      const insertedDevice = await tx.t_device.insert(newDevice);

      // save login action in history table
      await tx.t_history.insert({
        action: 'login',
        user_id: user.id,
        params: {
          device_id: insertedDevice.id,
        },
      });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        device_id: insertedDevice.id,
        rsa_encrypted_private_key: userWithSecret.rsa_encrypted_private_key,
        ecdsa_encrypted_private_key: userWithSecret.ecdsa_encrypted_private_key,
        rsa_public_key: userWithSecret.rsa_public_key,
        ecdsa_public_key: userWithSecret.ecdsa_public_key,
        encrypted_backup_key: userWithSecret.encrypted_backup_key,
        gladys_4_user_id: userWithSecret.gladys_4_user_id,
      };
    });
  }

  async function getAccessToken(user, refreshToken) {
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // we are looking for devices not revoked with
    // this refresh_token_hash
    const device = await db.t_device.findOne({
      user_id: user.id,
      refresh_token_hash: refreshTokenHash,
      revoked: false,
      is_deleted: false,
    });

    // the device doesn't exist or has been revoked
    if (device === null) {
      logger.debug(`Forbidden: Refresh token not found in DB`);
      throw new ForbiddenError();
    }

    // we get the current user account, to be sure the account is active
    const fullUser = await db.t_user.findOne({
      id: user.id,
      is_deleted: false,
    });

    // the user doesn't exist or has been revoked
    if (fullUser === null) {
      logger.debug(`Forbidden: User not found or revoked`);
      throw new ForbiddenError();
    }

    const scope = ['dashboard:read', 'dashboard:write', 'two-factor-configure'];
    const accessToken = jwtService.generateAccessToken(user, scope);

    // set the last seen to now
    await db.t_device.update(device.id, {
      last_seen: new Date(),
    });

    return {
      access_token: accessToken,
    };
  }

  async function forgotPassword(email) {
    const user = await db.t_user.findOne(
      {
        email,
        email_confirmed: true,
        is_deleted: false,
      },
      { fields: ['id', 'language', 'email', 'two_factor_enabled'] },
    );

    if (user === null) {
      throw new NotFoundError();
    }

    const resetPasswordToken = (await randomBytes(64)).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetPasswordToken).digest('hex');

    const resetPasswordInserted = await db.t_reset_password.insert({
      token_hash: tokenHash,
      user_id: user.id,
    });

    await mailService.send(user, 'password_reset', {
      resetPasswordUrlGladys4: `${process.env.GLADYS_PLUS_FRONTEND_URL}/reset-password?token=${encodeURI(
        resetPasswordToken,
      )}`,
    });

    return resetPasswordInserted;
  }

  async function getEmailResetPassword(forgotPasswordToken) {
    const tokenHash = crypto.createHash('sha256').update(forgotPasswordToken).digest('hex');

    const resetPasswordRequest = await db.t_reset_password.findOne({
      token_hash: tokenHash,
      used: false,
      is_deleted: false,
    });

    if (resetPasswordRequest === null) {
      throw new NotFoundError();
    }

    const userWithEmail = await db.t_user.findOne(
      {
        id: resetPasswordRequest.user_id,
      },
      { fields: ['id', 'email', 'two_factor_enabled'] },
    );

    return userWithEmail;
  }

  async function resetPassword(forgotPasswordToken, data) {
    // first, we validate the data sent
    const { error } = Joi.validate(data, schema.resetPasswordSchema, {
      stripUnknown: true,
      abortEarly: false,
      presence: 'required',
    });

    if (error) {
      logger.debug(error);
      throw new ValidationError('resetPassword', error);
    }

    const tokenHash = crypto.createHash('sha256').update(forgotPasswordToken).digest('hex');

    const resetPasswordRequest = await db.t_reset_password.findOne({
      token_hash: tokenHash,
      used: false,
      is_deleted: false,
    });

    if (resetPasswordRequest === null) {
      throw new NotFoundError();
    }

    const resetPasswordTimeMilli = new Date(resetPasswordRequest.created_at).getTime();

    const tokenExpirationTime = resetPasswordTimeMilli + resetPasswordTokenExpiryInMilliSeconds;
    const now = new Date().getTime();

    // if token has been issued to much in the past
    if (tokenExpirationTime < now) {
      logger.info(`Reset password: Token has expired`);
      throw new NotFoundError();
    }

    const userWithSecret = await db.t_user.findOne(
      {
        id: resetPasswordRequest.user_id,
      },
      { fields: ['id', 'two_factor_secret', 'two_factor_enabled', 'account_id'] },
    );

    // user need its two factor token to reset password if enabled
    if (userWithSecret.two_factor_enabled === true) {
      const tokenValidates = speakeasy.totp.verify({
        secret: userWithSecret.two_factor_secret,
        token: data.two_factor_code,
        window: 2,
      });

      if (!tokenValidates) {
        logger.info(`Reset password error: two factor code is not valid.`);
        throw new ForbiddenError();
      }
    }

    return db.withTransaction(async (tx) => {
      // now update user password
      const newUser = await tx.t_user.update(
        resetPasswordRequest.user_id,
        {
          srp_salt: data.srp_salt,
          srp_verifier: data.srp_verifier,
          rsa_public_key: data.rsa_public_key,
          rsa_encrypted_private_key: data.rsa_encrypted_private_key,
          ecdsa_public_key: data.ecdsa_public_key,
          ecdsa_encrypted_private_key: data.ecdsa_encrypted_private_key,
        },
        { fields: ['id', 'email', 'account_id'] },
      );

      // invalidate all current sessions
      const sessionsInvalidated = await tx.t_device.update(
        {
          user_id: resetPasswordRequest.user_id,
          revoked: false,
          is_deleted: false,
        },
        { revoked: true },
        { fields: ['id'] },
      );

      // mark reset password token as used
      await tx.t_reset_password.update(resetPasswordRequest.id, {
        used: true,
      });

      logger.info(`Reset password: Successfully invalidated ${sessionsInvalidated.length} sessions.`);

      return newUser;
    });
  }

  async function getSetupState(user) {
    const fullUser = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'account_id', 'gladys_user_id'] },
    );

    const account = await db.t_account.findOne({
      id: fullUser.account_id,
    });

    const instances = await db.t_instance.find({
      account_id: fullUser.account_id,
    });

    return {
      billing_setup: account.stripe_customer_id !== null,
      stripe_portal_key: account.stripe_portal_key,
      gladys_instance_setup: instances.length > 0,
      user_gladys_acccount_linked: fullUser.gladys_user_id !== null,
    };
  }

  return {
    signup,
    updateUser,
    confirmEmail,
    configureTwoFactor,
    enableTwoFactor,
    loginGetSalt,
    loginGenerateEphemeralValuePair,
    loginDeriveSession,
    loginTwoFactor,
    getAccessToken,
    forgotPassword,
    resetPassword,
    getEmailResetPassword,
    getMySelf,
    getSetupState,
    getNewTwoFactorSecret,
    updateTwoFactor,
  };
};
