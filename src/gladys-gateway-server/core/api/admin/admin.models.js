const Promise = require('bluebird');
const crypto = require('crypto');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const { NotFoundError } = require('../../common/error');

module.exports = function AdminModel(logger, db, redisClient, mailService, slackService) {
  async function getAllAccounts() {
    const request = `
      SELECT t_account.*, COUNT(t_user.id) as user_count 
      FROM t_account
      LEFT JOIN t_user ON t_user.account_id = t_account.id
      GROUP BY t_account.id
      ORDER BY t_account.created_at DESC;
    `;

    return db.query(request);
  }

  async function resendConfirmationEmail(accountId, languageParam) {
    const account = await db.t_account.findOne({ id: accountId });

    // if account does not exist
    if (account === null) {
      throw new NotFoundError();
    }

    const email = account.name;
    const role = 'admin';
    const language = languageParam || 'en';

    // generate email confirmation token
    const token = (await randomBytes(64)).toString('hex');

    // we hash the token in DB so it's not possible to get the token if the DB is compromised in read-only
    // (due to SQL injection for example)
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    await db.t_invitation.insert({
      email,
      role,
      token_hash: tokenHash,
      account_id: account.id,
    });

    // we invite the user in slack if slack is enabled
    await slackService.inviteUser(email);

    await mailService.send({ email, language }, 'welcome', {
      confirmationUrl: `${process.env.GLADYS_GATEWAY_FRONTEND_URL}/signup?token=${encodeURI(token)}`,
    });

    return account;
  }

  return {
    resendConfirmationEmail,
    getAllAccounts,
  };
};
