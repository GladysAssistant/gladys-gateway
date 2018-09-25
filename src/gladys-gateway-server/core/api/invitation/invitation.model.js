const { ValidationError, AlreadyExistError, ForbiddenError } = require('../../common/error');
const Joi = require('joi');
const crypto = require('crypto');
const Promise = require('bluebird');
const randomBytes = Promise.promisify(require('crypto').randomBytes);

module.exports = function InvitationModel(logger, db, redisClient, mailgunService) {

  const schema = {
    email: Joi.string().email()
  };

  async function inviteUser(user, newInvitation) {

    const { error, value } = Joi.validate(newInvitation, schema, {stripUnknown: true, abortEarly: false, presence: 'required'});

    if (error) {
      logger.debug(error);
      throw new ValidationError('invitation', error);
    }

    return db.withTransaction(async tx => {

      // clean email
      var email = value.email.trim().toLowerCase();

      // first we get the user to see if he is allowed to do that
      var userWithAccount = await tx.t_user.findOne({
        id: user.id
      }, {fields: ['id', 'name', 'language', 'account_id', 'role']});

      // only admin can send invite
      if(userWithAccount.role !== 'admin') {
        throw new ForbiddenError();
      }

      var emailAlreadyExist = await tx.t_invitation.findOne({
        email,
        account_id: userWithAccount.account_id
      });

      // email already exist in this account
      if(emailAlreadyExist !== null) {
        throw new AlreadyExistError();
      }
      
      // generate email confirmation token
      var token = (await randomBytes(64)).toString('base64');

      // we hash the token in DB so it's not possible to get the token if the DB is compromised in read-only
      // (due to SQL injection for example)
      var tokenHash = crypto.createHash('sha256').update(token).digest('base64');

      var insertedInvitation = await tx.t_invitation.insert({
        email,
        token_hash: tokenHash,
        account_id: userWithAccount.account_id
      });

      await mailgunService.send(userWithAccount, 'invitation', {
        invitationUrl: process.env.GLADYS_GATEWAY_FRONTEND_URL + '/invitation-link/' + token,
        nameOfAdminInviting: userWithAccount.name
      });

      return insertedInvitation;
    });
  }

  return {
    inviteUser
  };
};