const { AlreadyExistError } = require('./error');

// One Gladys Plus user per Gladys user of the instance: a Gladys user (gladys_4_user_id)
// can be linked to a single user of the account, and carried by a single pending
// invitation. Checked wherever the link is set by an admin: inviting for a Gladys user,
// linking a user or a pending invitation to one.
async function assertGladysUserNotLinked(db, accountId, gladys4UserId, { ignoreUserId, ignoreInvitationId } = {}) {
  const users = await db.t_user.find(
    {
      gladys_4_user_id: gladys4UserId,
      account_id: accountId,
      is_deleted: false,
    },
    { fields: ['id'] },
  );
  if (users.some((user) => user.id !== ignoreUserId)) {
    throw new AlreadyExistError('user linked to gladys_4_user_id', gladys4UserId);
  }
  const invitations = await db.t_invitation.find(
    {
      gladys_4_user_id: gladys4UserId,
      account_id: accountId,
      revoked: false,
      accepted: false,
      is_deleted: false,
    },
    { fields: ['id'] },
  );
  if (invitations.some((invitation) => invitation.id !== ignoreInvitationId)) {
    throw new AlreadyExistError('invitation for gladys_4_user_id', gladys4UserId);
  }
}

module.exports = { assertGladysUserNotLinked };
