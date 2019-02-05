const Joi = require('joi');
const crypto = require('crypto');
const Promise = require('bluebird');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const {
  ValidationError, AlreadyExistError, ForbiddenError, NotFoundError,
} = require('../../common/error');
const schema = require('../../common/schema');

module.exports = function InvitationModel(logger, db, redisClient, mailgunService) {
  async function inviteUser(user, newInvitation) {
    const { error, value } = Joi.validate(newInvitation, schema.invitationSchema, { stripUnknown: true, abortEarly: false, presence: 'required' });

    if (error) {
      logger.debug(error);
      throw new ValidationError('invitation', error);
    }

    return db.withTransaction(async (tx) => {
      // clean email
      const email = value.email.trim().toLowerCase();
      const { role } = value;

      // first we get the user to see if he is allowed to do that
      const userWithAccount = await tx.t_user.findOne({
        id: user.id,
      }, { fields: ['id', 'name', 'language', 'account_id', 'role'] });

      // only admin can send invite
      if (userWithAccount.role !== 'admin') {
        throw new ForbiddenError();
      }

      const emailAlreadyExist = await tx.t_invitation.findOne({
        email,
        account_id: userWithAccount.account_id,
      });

      // email already exist in this account
      if (emailAlreadyExist !== null) {
        throw new AlreadyExistError();
      }

      // generate email confirmation token
      const token = (await randomBytes(64)).toString('hex');

      // we hash the token in DB so it's not possible to get the token if the DB is compromised in read-only
      // (due to SQL injection for example)
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const insertedInvitation = await tx.t_invitation.insert({
        email,
        role,
        token_hash: tokenHash,
        account_id: userWithAccount.account_id,
      });

      await mailgunService.send({ email, language: userWithAccount.language }, 'invitation', {
        invitationUrl: `${process.env.GLADYS_GATEWAY_FRONTEND_URL}/signup?token=${encodeURI(token)}`,
        nameOfAdminInviting: userWithAccount.name,
      });

      return insertedInvitation;
    });
  }

  async function accept(dataParam) {
    const data = dataParam;
    const tokenHash = crypto.createHash('sha256').update(data.token).digest('hex');

    // we look if for the token hash in the db
    const invitation = await db.t_invitation.findOne({
      token_hash: tokenHash,
      revoked: false,
      accepted: false,
      is_deleted: false,
    });

    if (invitation === null) {
      throw new NotFoundError();
    }

    data.email = invitation.email;

    const { error, value } = Joi.validate(data, schema.signupSchema, { stripUnknown: true, abortEarly: false, presence: 'required' });

    if (error) {
      logger.debug(error);
      throw new ValidationError('user', error);
    }

    return db.withTransaction(async (tx) => {
      // email of the user is already confirmed as he clicked on the link in his email
      value.email_confirmed = true;
      value.account_id = invitation.account_id;
      value.email_confirmation_token_hash = invitation.token_hash;
      value.role = invitation.role;

      // set gravatar image for the user
      const emailHash = crypto.createHash('md5').update(value.email).digest('hex');
      value.profile_url = `https://www.gravatar.com/avatar/${emailHash}`;

      if (process.env.DEFAULT_USER_PROFILE_URL) {
        value.profile_url += `?d=${process.env.DEFAULT_USER_PROFILE_URL}`;
        value.profile_url = encodeURI(value.profile_url);
      }

      const insertedUser = await tx.t_user.insert(value);

      await tx.t_invitation.update(invitation.id, {
        accepted: true,
      });

      return {
        id: insertedUser.id,
        email: insertedUser.language,
        language: insertedUser.language,
        profile_url: insertedUser.profile_url,
        account_id: insertedUser.account_id,
      };
    });
  }

  async function getInvitation(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // we look if for the token hash in the db
    const invitation = await db.t_invitation.findOne({
      token_hash: tokenHash,
      revoked: false,
      accepted: false,
      is_deleted: false,
    }, { fields: ['id', 'email'] });

    if (invitation === null) {
      throw new NotFoundError();
    }

    return invitation;
  }

  async function revokeInvitation(user, invitationId) {
    // get the account_id of the currently connected user
    const userWithAccount = await db.t_user.findOne({
      id: user.id,
    }, { fields: ['id', 'role', 'account_id'] });

    if (userWithAccount.role !== 'admin') {
      throw new ForbiddenError('You must be admin to perform this operation');
    }

    await db.t_invitation.update({
      id: invitationId,
      account_id: userWithAccount.account_id,
      revoked: false,
      accepted: false,
      is_deleted: false,
    }, {
      revoked: true,
    });
  }

  return {
    inviteUser,
    accept,
    getInvitation,
    revokeInvitation,
  };
};
