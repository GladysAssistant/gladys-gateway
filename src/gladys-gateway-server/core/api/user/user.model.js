const Joi = require('joi');
const { ValidationError, AlreadyExistError, NotFoundError, ForbiddenError } = require('../../common/error');
const Promise = require('bluebird');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const uuid = require('uuid');
const srpServer = require('secure-remote-password/server');
const schema = require('../../common/schema');

const redisLoginSessionExpiryInSecond = 60;

module.exports = function UserModel(logger, db, redisClient, jwtService) {

  /**
   * Create a new user with his email and language
   */
  async function signup(newUser) {
    newUser.email = newUser.email.trim().toLowerCase();

    const { error, value } = Joi.validate(newUser, schema.signupSchema, {stripUnknown: true, abortEarly: false, presence: 'required'});

    if (error) {
      logger.debug(error);
      throw new ValidationError('user', error);
    }

    return db.withTransaction(async tx => {

      // we check that one user with this confirmed email does not already exist
      var userAlreadyExist = await tx.t_user.findOne({
        email: newUser.email,
        email_confirmed: true,
        is_deleted: false
      }, {fields: ['id']});

      if(userAlreadyExist !== null) {
        logger.warn(`A user with that email already exist (${userAlreadyExist.id})`);
        throw new AlreadyExistError('user', newUser.email);
      }
      
      var newAccount = {
        name: value.email
      };

      // create account in DB and set account_id to user object
      var insertedAccount = await tx.t_account.insert(newAccount);
      value.account_id = insertedAccount.id;

      // generate email confirmation token
      var emailConfirmationToken = (await randomBytes(64)).toString('base64');

      // we hash the token in DB so it's not possible to get the token if the DB is compromised in read-only
      // (due to SQL injection for example)
      value.email_confirmation_token_hash = crypto.createHash('sha256').update(emailConfirmationToken).digest('base64');
      
      // user signing up is admin
      value.role = 'admin';

      // set gravatar image for the user
      var emailHash = crypto.createHash('md5').update(value.email).digest('hex');
      value.profile_url = `https://www.gravatar.com/avatar/${emailHash}`;

      if(process.env.DEFAULT_USER_PROFILE_URL) {
        value.profile_url += `?d=${process.env.DEFAULT_USER_PROFILE_URL}`;
        value.profile_url = encodeURI(value.profile_url);
      }

      // we insert the user in db
      var insertedUser = await tx.t_user.insert(value);
      
      return {
        id: insertedUser.id,
        email: insertedUser.language,
        email_confirmation_token: emailConfirmationToken,
        profile_url: insertedUser.profile_url,
        language: insertedUser.language,
        account_id: insertedAccount.id
      };
    });
  }

  async function updateUser(user, data) {
    const { error, value } = Joi.validate(data, schema.signupSchema, {stripUnknown: true, abortEarly: false, presence: 'optional'});

    if (error) {
      logger.debug(error);
      throw new ValidationError('user', error);
    }

    // we get the current user to see if his email has changed
    const currentUser = await db.t_user.findOne({
      id: user.id
    }, {fields: ['id', 'email']});

    var emailConfirmationToken;

    if(value.email) {
      value.email = value.email.trim().toLowerCase();
      
      if(value.email !== currentUser.email) {
        value.email_confirmed = false;
        
        // generate email confirmation token
        emailConfirmationToken = (await randomBytes(64)).toString('base64');

        // we hash the token in DB so it's not possible to get the token if the DB is compromised in read-only
        // (due to SQL injection for example)
        value.email_confirmation_token_hash = crypto.createHash('sha256').update(emailConfirmationToken).digest('base64');
      }
    }

    var updatedUser = await db.t_user.update(user.id, value, {fields: ['id', 'name', 'email', 'email_confirmed', 'language']});
    updatedUser.email_confirmation_token = emailConfirmationToken;
    return updatedUser;
  }

  async function confirmEmail(emailConfirmationToken) {

    // we hash the token again
    var confirmationTokenHash = crypto.createHash('sha256').update(emailConfirmationToken).digest('base64');
    
    // search for a user with this hash in database
    var user = await db.t_user.findOne({
      is_deleted: false,
      email_confirmation_token_hash: confirmationTokenHash
    }, {fields: ['id']});

    // if user is not found, the token is wrong
    if(user === null){
      throw new NotFoundError('Confirmation token not found');
    }

    var user = await db.t_user.update(user.id, {
      email_confirmed: true
    }, {fields: ['id', 'email_confirmed']});

    return user;
  }

  async function loginGetSalt({ email }) {
    
    var user = await db.t_user.findOne({
      is_deleted: false,
      email_confirmed: true,
      email: email
    }, {fields: ['srp_salt']});

    if(user === null) {
      throw new NotFoundError('Email not found');
    }

    return user;
  }

  async function loginGenerateEphemeralValuePair(data){
    
    // we retrieve the verifier from the database
    var user = await db.t_user.findOne({
      is_deleted: false,
      email_confirmed: true,
      email: data.email
    }, {fields: ['id', 'email', 'srp_salt', 'srp_verifier', 'two_factor_enabled']});

    if(user === null) {
      throw new NotFoundError('Email not found');
    }

    const serverEphemeral = srpServer.generateEphemeral(user.srp_verifier);
    const loginSessionKey = uuid.v4();

    var loginSessionState = {
      serverEphemeral,
      user,
      clientEphemeralPublic: data.client_ephemeral_public
    };
    
    await redisClient.setAsync(`login_session:${loginSessionKey}`, JSON.stringify(loginSessionState), 'EX', redisLoginSessionExpiryInSecond);

    return {
      server_ephemeral_public: serverEphemeral.public,
      login_session_key: loginSessionKey
    };
  }

  async function loginDeriveSession(data) {
    var loginSessionState = await redisClient.getAsync(`login_session:${data.login_session_key}`);

    if(loginSessionState === null) {
      throw new NotFoundError('Login session not found');
    }   

    try {
      var loginSessionState = JSON.parse(loginSessionState); 

      // try to deriveSession, it will throw an Error if the proof is not right
      const serverSession = srpServer.deriveSession(
        loginSessionState.serverEphemeral.secret, 
        loginSessionState.clientEphemeralPublic, 
        loginSessionState.user.srp_salt, 
        loginSessionState.user.email,
        loginSessionState.user.srp_verifier, 
        data.client_session_proof
      );

      // if two factor is enabled, we only return a token that gives access 
      // to the two factor verify route
      if(loginSessionState.user.two_factor_enabled) {
        
        var twoFactorToken = jwtService.generateTwoFactorToken(loginSessionState.user);

        return {
          server_session_proof: serverSession.proof,
          two_factor_token: twoFactorToken
        };
      } 

      // Otherwise, we send an access token only valid 1 hour so the user can enable two factor
      else {
        var accessToken = jwtService.generateAccessToken(loginSessionState.user, ['two-factor-configure']);

        return {
          server_session_proof: serverSession.proof,
          access_token: accessToken
        };
      }
    } catch(e) {
      throw new ForbiddenError();
    }
  }

  async function configureTwoFactor(user) {
    var secret = speakeasy.generateSecret();
    await db.t_user.update(user.id, {
      two_factor_secret: secret.base32
    });
    return {
      otpauth_url: secret.otpauth_url
    };
  }

  async function enableTwoFactor(user, twoFactorCode) {
    var userWithSecret = await db.t_user.findOne({
      id: user.id
    }, {fields: ['id', 'two_factor_secret']});
    
    var tokenValidates = speakeasy.totp.verify({
      secret: userWithSecret.two_factor_secret,
      encoding: 'base32',
      token: twoFactorCode,
      window: 2
    });

    if(!tokenValidates) {
      throw new ForbiddenError();
    }

    await db.t_user.update({
      id: user.id
    }, {two_factor_enabled: true});
    
    return {
      two_factor_enabled: true
    };
  }

  async function loginTwoFactor(user, twoFactorCode, deviceName, userAgent){
    var userWithSecret = await db.t_user.findOne({
      id: user.id
    }, {fields: ['id', 'two_factor_secret']});

    var tokenValidates = speakeasy.totp.verify({
      secret: userWithSecret.two_factor_secret,
      encoding: 'base32',
      token: twoFactorCode,
      window: 2
    });

    if(!tokenValidates) {
      throw new ForbiddenError();
    }

    var newDevice = {
      id: uuid.v4(),
      name: deviceName,
      user_id: user.id
    };

    var scope =  ['dashoard:read', 'dashboard:write', 'two-factor-configure'];
    var userAgentHash = crypto.createHash('sha256').update(userAgent).digest('base64');

    var refreshToken = jwtService.generateRefreshToken(user, scope, newDevice.id, userAgentHash);
    var accessToken = jwtService.generateAccessToken(user, scope);

    // we save a hash of the refresh token so we can invalidate it after. 
    // We don't want to save the refresh token in clear text because if an attacker get read access 
    // to the DB (ex: SQL injection) he could get the token and use it for write use
    newDevice.refresh_token_hash = crypto.createHash('sha256').update(refreshToken).digest('base64');

    return db.withTransaction(async tx => {

      var insertedDevice = await tx.t_device.insert(newDevice);
      
      // save login action in history table
      await tx.t_history.insert({
        action: 'login',
        user_id: user.id,
        params: {
          device_id: insertedDevice.id
        }
      });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        device_id: insertedDevice.id
      };
    });
  }
  
  async function getAccessToken(user, refreshToken){

    var refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('base64');

    // we are looking for devices not revoked with 
    // this refresh_token_hash
    var device = await db.t_device.findOne({
      user_id: user.id,
      refresh_token_hash: refreshTokenHash,
      revoked: false,
      is_deleted: false
    });

    // the device doesn't exist or has been revoked
    if(device === null) {
      throw new ForbiddenError();
    }

    var scope =  ['dashoard:read', 'dashboard:write', 'two-factor-configure'];
    var accessToken = jwtService.generateAccessToken(user, scope);

    return {
      access_token: accessToken
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
    getAccessToken
  };
};