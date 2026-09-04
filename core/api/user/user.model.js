const Promise = require('bluebird');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const srpServer = require('secure-remote-password/server');
const {
  ValidationError,
  AlreadyExistError,
  NotFoundError,
  ForbiddenError,
  TooManyRequestsError,
} = require('../../common/error');
const { normalizeEmail } = require('../../common/normalize-email');
const schema = require('../../common/schema');

const REDIS_LOGIN_SESSION_EXPIRY_IN_SECONDS = 120;
// A TOTP code has 6 digits and is accepted with a window of 2 steps: without a limit on
// failed attempts per user, an attacker knowing the password can brute force the code.
const TWO_FACTOR_MAX_FAILED_ATTEMPTS = 5;
const TWO_FACTOR_FAILED_ATTEMPTS_WINDOW_IN_SECONDS = 15 * 60;
const TWO_FACTOR_FAILED_ATTEMPTS_REDIS_PREFIX = 'two_factor_failed_attempts';
const resetPasswordTokenExpiryInMilliSeconds = 2 * 60 * 60 * 1000;
const TWO_FACTOR_RECOVERY_CODE_COUNT = 10;
// 128 bits of entropy per code, so knowing the SHA-256 hash of a code
// doesn't allow to brute-force the code itself
const TWO_FACTOR_RECOVERY_CODE_SIZE_IN_BYTES = 16;
const TWO_FACTOR_RECOVERY_CODE_GROUP_SIZE_IN_CHARS = 4;

// recovery codes are case-insensitive and can be entered with or without dash/spaces
function hashTwoFactorRecoveryCode(recoveryCode) {
  const normalizedRecoveryCode = recoveryCode.toLowerCase().replace(/[\s-]/g, '');
  return crypto.createHash('sha256').update(normalizedRecoveryCode).digest('hex');
}

module.exports = function UserModel(logger, db, redisClient, jwtService, mailService) {
  function getTwoFactorAttemptsKey(userId) {
    return `${TWO_FACTOR_FAILED_ATTEMPTS_REDIS_PREFIX}:${userId}`;
  }

  // Counts the attempt BEFORE verifying the code, atomically (SET NX EX + INCR in one
  // MULTI), so concurrent requests cannot all slip under the limit, and the key always
  // carries a TTL even if the process dies between the two commands.
  async function countTwoFactorAttempt(userId) {
    const key = getTwoFactorAttemptsKey(userId);
    const [, attempts] = await redisClient
      .multi()
      .set(key, 0, { NX: true, EX: TWO_FACTOR_FAILED_ATTEMPTS_WINDOW_IN_SECONDS })
      .incr(key)
      .exec();
    return attempts;
  }

  async function resetFailedTwoFactorAttempts(userId) {
    await redisClient.del(getTwoFactorAttemptsKey(userId));
  }

  // Verifies a TOTP code with the per-user failed attempts limit applied
  async function verifyTwoFactorCode(userId, twoFactorSecret, twoFactorCode) {
    const attempts = await countTwoFactorAttempt(userId);
    if (attempts > TWO_FACTOR_MAX_FAILED_ATTEMPTS) {
      logger.warn(`Two factor: too many failed attempts for user ${userId}`);
      throw new TooManyRequestsError('Too many failed two factor attempts, try again later.');
    }

    const isCodeAStringOrANumber = typeof twoFactorCode === 'string' || typeof twoFactorCode === 'number';
    const tokenValidates = speakeasy.totp.verify({
      secret: twoFactorSecret,
      token: isCodeAStringOrANumber ? String(twoFactorCode) : '',
      window: 2,
    });

    if (!tokenValidates) {
      throw new ForbiddenError();
    }

    await resetFailedTwoFactorAttempts(userId);
  }

  // Sensitive operations on a logged-in account (changing the email address, replacing the
  // TOTP secret, regenerating the recovery codes) require the CURRENT second factor, not only
  // an access token. Otherwise a stolen 1-hour access token would be enough to redirect the
  // account recovery flow (email + 2FA) to an attacker and take over the account for good.
  // A user without two factor enabled has nothing to prove.
  async function verifyCurrentTwoFactor(userWithSecret, twoFactorCode, actionDescription) {
    if (userWithSecret.two_factor_enabled !== true) {
      return;
    }

    if (twoFactorCode === undefined || twoFactorCode === null) {
      throw new ForbiddenError(`A valid two factor code is required to ${actionDescription}`);
    }

    await verifyTwoFactorCode(userWithSecret.id, userWithSecret.two_factor_secret, twoFactorCode);
  }

  /**
   * Create a new user with his email and language
   */
  async function signup(newUserParam) {
    const newUser = newUserParam;
    newUser.email = normalizeEmail(newUser.email);

    const { error, value } = schema.signupSchema.validate(newUser, {
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
      (t_account.current_period_end + interval '24 hour') as current_period_end, t_account.plan as plan, 
      t_account.status as status
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
    const { error, value } = schema.updateUserSchema.validate(data, {
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
      { fields: ['id', 'email', 'two_factor_enabled', 'two_factor_secret'] },
    );

    let emailConfirmationToken;
    let previousEmail;

    if (value.email) {
      value.email = normalizeEmail(value.email);

      if (value.email !== currentUser.email) {
        // The email address is the recovery channel of the account (forgot password).
        // An access token alone is not enough to move it: a token stolen from a browser
        // (XSS) or a log must not be able to take over the account, so the user has to
        // prove he still has his second factor.
        await verifyCurrentTwoFactor(currentUser, data.two_factor_code, 'change the email address');

        previousEmail = currentUser.email;
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
    // The confirmation token and the previous email are for the controller (emails to send),
    // they must never be sent back in the API response: the caller of this route could
    // otherwise confirm an email address he doesn't control.
    updatedUser.email_confirmation_token = emailConfirmationToken;
    updatedUser.previous_email = previousEmail;
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
        email: normalizeEmail(email),
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
        email: normalizeEmail(data.email),
      },
      { fields: ['id', 'email', 'srp_salt', 'srp_verifier', 'two_factor_enabled'] },
    );

    if (user === null) {
      throw new NotFoundError('Email not found');
    }

    const serverEphemeral = srpServer.generateEphemeral(user.srp_verifier);
    const loginSessionKey = crypto.randomUUID();

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

  async function updateTwoFactor(user, twoFactorSecret, twoFactorCode, currentTwoFactorCode) {
    const userWithSecret = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'two_factor_enabled', 'two_factor_secret'] },
    );

    // the current secret can only be replaced by someone who holds it
    await verifyCurrentTwoFactor(userWithSecret, currentTwoFactorCode, 'replace the two factor secret');

    if (typeof twoFactorSecret !== 'string' || twoFactorSecret.length === 0) {
      throw new ForbiddenError('A new two factor secret is required');
    }

    const isCodeAStringOrANumber = typeof twoFactorCode === 'string' || typeof twoFactorCode === 'number';
    const tokenValidates = speakeasy.totp.verify({
      secret: twoFactorSecret,
      token: isCodeAStringOrANumber ? String(twoFactorCode) : '',
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

  async function createDeviceSession(tx, userWithSecret, deviceName, userAgent) {
    const newDevice = {
      id: crypto.randomUUID(),
      name: deviceName,
      user_id: userWithSecret.id,
    };

    const scope = ['dashboard:read', 'dashboard:write', 'two-factor-configure'];
    const userAgentHash = crypto.createHash('sha256').update(userAgent).digest('hex');

    const refreshToken = jwtService.generateRefreshToken(userWithSecret, scope, newDevice.id, userAgentHash);
    const accessToken = jwtService.generateAccessToken(userWithSecret, scope);

    // we save a hash of the refresh token so we can invalidate it after.
    // We don't want to save the refresh token in clear text because if an attacker get read access
    // to the DB (ex: SQL injection) he could get the token and use it for write use
    newDevice.refresh_token_hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const insertedDevice = await tx.t_device.insert(newDevice);

    // save login action in history table
    await tx.t_history.insert({
      action: 'login',
      user_id: userWithSecret.id,
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
  }

  // Removing the recovery code and verifying that it was there is done in one single SQL query,
  // so 2 concurrent requests can never use the same recovery code twice.
  async function consumeTwoFactorRecoveryCode(tx, userId, recoveryCode) {
    if (typeof recoveryCode !== 'string' || recoveryCode.length === 0) {
      return false;
    }

    const recoveryCodeHash = hashTwoFactorRecoveryCode(recoveryCode);

    const usersUpdated = await tx.query(
      `
      UPDATE t_user
      SET two_factor_recovery_codes = array_remove(two_factor_recovery_codes, $2)
      WHERE id = $1 AND $2 = ANY(two_factor_recovery_codes)
      RETURNING id
    `,
      [userId, recoveryCodeHash],
    );

    return usersUpdated.length === 1;
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

    await verifyTwoFactorCode(userWithSecret.id, userWithSecret.two_factor_secret, twoFactorCode);

    return db.withTransaction((tx) => createDeviceSession(tx, userWithSecret, deviceName, userAgent));
  }

  async function generateTwoFactorRecoveryCodes(user, twoFactorCode) {
    const fullUser = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'two_factor_enabled', 'two_factor_secret'] },
    );

    if (fullUser.two_factor_enabled !== true) {
      throw new ForbiddenError('Two Factor Authentication is not enabled');
    }

    // a recovery code is a full substitute of the TOTP code (login, password reset):
    // generating new ones requires the current second factor
    await verifyCurrentTwoFactor(fullUser, twoFactorCode, 'generate new recovery codes');

    const buffer = await randomBytes(TWO_FACTOR_RECOVERY_CODE_COUNT * TWO_FACTOR_RECOVERY_CODE_SIZE_IN_BYTES);

    const recoveryCodes = [];
    for (let i = 0; i < TWO_FACTOR_RECOVERY_CODE_COUNT; i += 1) {
      const code = buffer
        .slice(i * TWO_FACTOR_RECOVERY_CODE_SIZE_IN_BYTES, (i + 1) * TWO_FACTOR_RECOVERY_CODE_SIZE_IN_BYTES)
        .toString('hex');
      // the code is displayed in groups of characters so it's easier to read & type
      recoveryCodes.push(code.match(new RegExp(`.{${TWO_FACTOR_RECOVERY_CODE_GROUP_SIZE_IN_CHARS}}`, 'g')).join('-'));
    }

    // we only store a hash of the codes so it's not possible to use them
    // if the DB is compromised in read-only (due to SQL injection for example)
    await db.t_user.update(user.id, {
      two_factor_recovery_codes: recoveryCodes.map(hashTwoFactorRecoveryCode),
    });

    return {
      recovery_codes: recoveryCodes,
    };
  }

  async function loginTwoFactorRecoveryCode(user, recoveryCode, deviceName, userAgent) {
    const userWithSecret = await db.t_user.findOne(
      {
        id: user.id,
      },
      {
        fields: [
          'id',
          'two_factor_enabled',
          'rsa_encrypted_private_key',
          'ecdsa_encrypted_private_key',
          'rsa_public_key',
          'ecdsa_public_key',
          'encrypted_backup_key',
          'gladys_4_user_id',
        ],
      },
    );

    if (userWithSecret.two_factor_enabled !== true) {
      logger.info(`Login with recovery code error: two factor is not enabled.`);
      throw new ForbiddenError();
    }

    // the recovery code is consumed in the same transaction as the session creation, so the
    // user doesn't lose a recovery code if the session can't be created
    return db.withTransaction(async (tx) => {
      const recoveryCodeConsumed = await consumeTwoFactorRecoveryCode(tx, userWithSecret.id, recoveryCode);

      if (!recoveryCodeConsumed) {
        logger.info(`Login with recovery code error: recovery code is not valid.`);
        throw new ForbiddenError();
      }

      return createDeviceSession(tx, userWithSecret, deviceName, userAgent);
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
        email: normalizeEmail(email),
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
    const { error } = schema.resetPasswordSchema.validate(data, {
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

    // user need its two factor token (or a recovery code) to reset password if enabled
    const useRecoveryCode = userWithSecret.two_factor_enabled === true && data.two_factor_recovery_code !== undefined;

    if (userWithSecret.two_factor_enabled === true && useRecoveryCode === false) {
      try {
        await verifyTwoFactorCode(userWithSecret.id, userWithSecret.two_factor_secret, data.two_factor_code);
      } catch (e) {
        logger.info(`Reset password error: two factor code is not valid.`);
        throw e;
      }
    }

    return db.withTransaction(async (tx) => {
      // a recovery code is single-use, it's consumed in the same transaction as the password
      // reset so the user doesn't lose a recovery code if the password reset fails
      if (useRecoveryCode) {
        const recoveryCodeConsumed = await consumeTwoFactorRecoveryCode(
          tx,
          userWithSecret.id,
          data.two_factor_recovery_code,
        );

        if (!recoveryCodeConsumed) {
          logger.info(`Reset password error: two factor recovery code is not valid.`);
          throw new ForbiddenError();
        }
      }

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
    loginTwoFactorRecoveryCode,
    generateTwoFactorRecoveryCodes,
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
