const crypto = require('crypto');
const Promise = require('bluebird');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const { ValidationError, AlreadyExistError, ForbiddenError, NotFoundError } = require('../../common/error');
const { normalizeEmail } = require('../../common/normalize-email');
const schema = require('../../common/schema');
const { assertGladysUserNotLinked } = require('../../common/gladys-user-link');

module.exports = function InvitationModel(logger, db, redisClient, mailService, telegramService) {
  async function inviteUser(user, newInvitation) {
    const { error, value } = schema.invitationSchema.validate(newInvitation, {
      stripUnknown: true,
      abortEarly: false,
      presence: 'required',
    });

    if (error) {
      logger.debug(error);
      throw new ValidationError('invitation', error);
    }

    const [invitation, userCreating, tokenGenerated] = await db.withTransaction(async (tx) => {
      // clean email
      const email = normalizeEmail(value.email);
      const { role } = value;
      const gladys4UserId = value.gladys_4_user_id || null;

      // first we get the user to see if he is allowed to do that
      const userWithAccount = await tx.t_user.findOne(
        {
          id: user.id,
        },
        { fields: ['id', 'name', 'email', 'language', 'account_id', 'role'] },
      );

      // only admin can send invite
      if (userWithAccount.role !== 'admin') {
        throw new ForbiddenError();
      }

      const invitationAlreadyExist = await tx.t_invitation.findOne({
        email,
        account_id: userWithAccount.account_id,
        revoked: false,
        accepted: false,
        is_deleted: false,
      });

      // email already exist in this account
      if (invitationAlreadyExist !== null) {
        throw new AlreadyExistError();
      }

      const userAlreadyExist = await tx.t_user.findOne(
        {
          email,
          account_id: userWithAccount.account_id,
          is_deleted: false,
        },
        { fields: ['id', 'name'] },
      );

      // user with this email already exist in this account
      if (userAlreadyExist !== null) {
        throw new AlreadyExistError();
      }

      // the invitation is for a Gladys user of the instance: one Gladys Plus user per
      // Gladys user, so neither a user nor a pending invitation may already be linked to it
      if (gladys4UserId !== null) {
        await assertGladysUserNotLinked(tx, userWithAccount.account_id, gladys4UserId);
      }

      // generate email confirmation token
      const token = (await randomBytes(64)).toString('hex');

      // we hash the token in DB so it's not possible to get the token if the DB is compromised in read-only
      // (due to SQL injection for example)
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const insertedInvitation = await tx.t_invitation.insert({
        email,
        role,
        gladys_4_user_id: gladys4UserId,
        token_hash: tokenHash,
        account_id: userWithAccount.account_id,
      });

      return [insertedInvitation, userWithAccount, token];
    });

    await mailService.send({ email: invitation.email, language: userCreating.language }, 'invitation', {
      invitationUrlGladys4: `${process.env.GLADYS_PLUS_FRONTEND_URL}/signup-gateway?token=${encodeURI(tokenGenerated)}`,
      nameOfAdminInviting: userCreating.name,
    });

    telegramService.sendAlert(
      `User ${userCreating.email} (${userCreating.name} - ${userCreating.language}) is inviting ${invitation.email} to Gladys Plus.`,
    );

    return invitation;
  }

  async function accept(dataParam, geo) {
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

    data.email = normalizeEmail(invitation.email);

    const { error, value } = schema.signupSchema.validate(data, {
      stripUnknown: true,
      abortEarly: false,
      presence: 'required',
    });

    if (error) {
      logger.debug(error);
      throw new ValidationError('user', error);
    }

    // Always store emails in lowercase, even if the invitation was created with mixed case
    value.email = normalizeEmail(value.email);

    telegramService.sendAlert(`User ${data.email} is accepting the invitation, country = ${geo?.country}`);

    return db.withTransaction(async (tx) => {
      // email of the user is already confirmed as he clicked on the link in his email
      value.email_confirmed = true;
      value.account_id = invitation.account_id;
      value.email_confirmation_token_hash = invitation.token_hash;
      value.role = invitation.role;
      // the admin invited them for a Gladys user of the instance: the new user is linked
      // to it right away (an invitation without one leaves the user to pick theirs). The
      // Gladys user may have been taken since the invitation was sent (another user picked
      // it on their first login): the link stays unique, the signup is refused (409)
      if (invitation.gladys_4_user_id) {
        await assertGladysUserNotLinked(tx, invitation.account_id, invitation.gladys_4_user_id, {
          ignoreInvitationId: invitation.id,
        });
        value.gladys_4_user_id = invitation.gladys_4_user_id;
      }

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
    const invitation = await db.t_invitation.findOne(
      {
        token_hash: tokenHash,
        revoked: false,
        accepted: false,
        is_deleted: false,
      },
      { fields: ['id', 'email'] },
    );

    if (invitation === null) {
      throw new NotFoundError();
    }

    return invitation;
  }

  async function revokeInvitation(user, invitationId) {
    // get the account_id of the currently connected user
    const userWithAccount = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'role', 'account_id'] },
    );

    if (userWithAccount.role !== 'admin') {
      throw new ForbiddenError('You must be admin to perform this operation');
    }

    await db.t_invitation.update(
      {
        id: invitationId,
        account_id: userWithAccount.account_id,
        revoked: false,
        accepted: false,
        is_deleted: false,
      },
      {
        revoked: true,
      },
    );
  }

  // Link a pending invitation to a Gladys user of the instance (or unlink it with null):
  // the user created from it will be linked to that Gladys user
  async function updateInvitationGladysUser(user, invitationId, body) {
    const { error, value } = schema.gladysUserLinkSchema.validate(body, {
      stripUnknown: true,
      abortEarly: false,
    });

    if (error) {
      logger.debug(error);
      throw new ValidationError('invitation', error);
    }

    const userWithAccount = await db.t_user.findOne(
      {
        id: user.id,
        is_deleted: false,
      },
      { fields: ['id', 'role', 'account_id'] },
    );

    if (userWithAccount === null || userWithAccount.role !== 'admin') {
      throw new ForbiddenError('You must be admin to perform this operation');
    }

    return db.withTransaction(async (tx) => {
      const invitation = await tx.t_invitation.findOne(
        {
          id: invitationId,
          account_id: userWithAccount.account_id,
          revoked: false,
          accepted: false,
          is_deleted: false,
        },
        { fields: ['id'] },
      );

      if (invitation === null) {
        throw new NotFoundError();
      }

      if (value.gladys_4_user_id !== null) {
        await assertGladysUserNotLinked(tx, userWithAccount.account_id, value.gladys_4_user_id, {
          ignoreInvitationId: invitation.id,
        });
      }

      const updatedInvitation = await tx.t_invitation.update(invitation.id, {
        gladys_4_user_id: value.gladys_4_user_id,
      });

      return {
        id: updatedInvitation.id,
        email: updatedInvitation.email,
        role: updatedInvitation.role,
        account_id: updatedInvitation.account_id,
        gladys_4_user_id: updatedInvitation.gladys_4_user_id,
        is_invitation: true,
        created_at: updatedInvitation.created_at,
      };
    });
  }

  return {
    inviteUser,
    accept,
    getInvitation,
    revokeInvitation,
    updateInvitationGladysUser,
  };
};
