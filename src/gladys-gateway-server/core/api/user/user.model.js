const Joi = require('joi');
const { ValidationError, AlreadyExistError, NotFoundError, ForbiddenError } = require('../../common/error');
const Promise = require('bluebird');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const uuid = require('uuid');
const srpServer = require('secure-remote-password/server');

const redisLoginSessionExpiryInSecond = 60;

module.exports = function UserModel(logger, db, redisClient, jwtService) {

  const signupSchema = Joi.object().keys({
    name: Joi.string().min(2).max(30).required(),
    email: Joi.string().email().required(),
    language: Joi.string().required().allow(['fr', 'en']),
    srp_salt: Joi.string().required(),
    srp_verifier: Joi.string().required(),
    public_key: Joi.string().required(),
    encrypted_private_key: Joi.string().required()
  });

  /**
   * Create a new user with his email and language
   */
  async function signup(newUser) {
    newUser.email = newUser.email.toLowerCase();

    const { error, value } = Joi.validate(newUser, signupSchema, {stripUnknown: true, abortEarly: false});

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
      
      // we insert the user in db
      var insertedUser = await tx.t_user.insert(value);
      
      return {
        id: insertedUser.id,
        email: insertedUser.language,
        email_confirmation_token: emailConfirmationToken,
        language: insertedUser.language,
        account_id: insertedAccount.id
      };
    });
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
        var accessToken = jwtService.generateAccessToken(loginSessionState.user, ['two_factor']);

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
  
  return {
    signup,
    confirmEmail,
    configureTwoFactor,
    loginGetSalt,
    loginGenerateEphemeralValuePair,
    loginDeriveSession
  };
};