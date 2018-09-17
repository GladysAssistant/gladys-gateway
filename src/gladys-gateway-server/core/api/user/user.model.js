const Joi = require('joi');
const { ValidationError, AlreadyExistError } = require('../../common/error');
const Promise = require('bluebird');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
var crypto = require('crypto');

module.exports = function UserModel(db, redis) {

  const signupSchema = Joi.object().keys({
    //    name: Joi.string().min(2).max(30).required(),
    email: Joi.string().email().required(),
    language: Joi.string().required(),
    //  account_id: Joi.string().uuid().required()
  });

  /**
   * Create a new user with his email and language
   */
  async function signup(newUser) {
    newUser.email = newUser.email.toLowerCase();

    const { error, value } = Joi.validate(newUser, signupSchema, {stripUnknown: true});

    if (error) {
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
        email_confirmation_token: emailConfirmationToken,
        account_id: insertedAccount.id
      };
    });
  }
  
  return {
    signup
  };
};