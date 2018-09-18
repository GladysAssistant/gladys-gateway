const Joi = require('joi');
const { ValidationError, AlreadyExistError, NotFoundError } = require('../../common/error');
const Promise = require('bluebird');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const bcryptSaltRounds = 12;

module.exports = function UserModel(logger, db, redis) {

  const signupSchema = Joi.object().keys({
    email: Joi.string().email().required(),
    language: Joi.string().required().allow(['fr', 'en']),
    password: Joi.string().min(8).required(),
    public_key: Joi.string().required(),
    encrypted_private_key: Joi.string().required()
  });

  /**
   * Create a new user with his email and language
   */
  async function signup(newUser) {
    newUser.email = newUser.email.toLowerCase();

    const { error, value } = Joi.validate(newUser, signupSchema, {stripUnknown: true});

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

      // we hash the password with bcrypt
      value.password_hash = await bcrypt.hash(value.password, bcryptSaltRounds);
      delete value.password;
      
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
  
  return {
    signup,
    confirmEmail
  };
};