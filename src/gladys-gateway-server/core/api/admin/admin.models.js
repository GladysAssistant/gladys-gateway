const Promise = require('bluebird');
const crypto = require('crypto');
const aws = require('aws-sdk');
const path = require('path');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const { NotFoundError, ForbiddenError } = require('../../common/error');

module.exports = function AdminModel(logger, db, redisClient, mailService, slackService, stripeService) {
  const spacesEndpoint = new aws.Endpoint(process.env.STORAGE_ENDPOINT);
  const s3 = new aws.S3({
    endpoint: spacesEndpoint,
  });
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
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await db.t_invitation.insert({
      email,
      role,
      token_hash: tokenHash,
      account_id: account.id,
    });

    // we invite the user in slack if slack is enabled
    await slackService.inviteUser(email);

    await mailService.send({ email, language }, 'welcome', {
      confirmationUrlGladys4: `${process.env.GLADYS_PLUS_FRONTEND_URL}/signup-gateway?token=${encodeURI(token)}`,
    });

    return account;
  }

  async function deleteAccount(accountId) {
    const account = await db.t_account.findOne({ id: accountId });
    // we get subscription from stripe side
    const [subscription, customer] = await Promise.all([
      stripeService.getSubscription(account.stripe_subscription_id),
      stripeService.getCustomer(account.stripe_customer_id),
    ]);
    logger.info(`Trying to delete customer ${customer.id}, ${customer.email}`);
    const now = new Date().getTime();
    if (subscription.current_period_end > now) {
      throw new ForbiddenError('Cannot delete an active customer');
    }
    const backups = await db.t_backup.find({ account_id: accountId });
    // deleting backups
    logger.info(`Deleting from Storage ${backups.length} backups.`);
    await Promise.map(
      backups,
      async (backup) => {
        const key = path.basename(backup.path);
        try {
          await s3.deleteObject({ Bucket: process.env.STORAGE_BUCKET, Key: key }).promise();
        } catch (e) {
          logger.warn(`Fail to delete ${backup.path}`);
          logger.warn(e);
        }
      },
      { concurrency: 10 },
    );
    // getting all users
    const users = await db.t_user.find({ account_id: accountId });
    await Promise.mapSeries(users, async (user) => {
      await db.t_device.destroy({ user_id: user.id });
      await db.t_history.destroy({ user_id: user.id });
      await db.t_open_api_key.destroy({ user_id: user.id });
      await db.t_reset_password.destroy({ user_id: user.id });
      await db.t_user.destroy({ id: user.id });
    });
    await db.t_backup.destroy({ account_id: accountId });
    await db.t_account_payment_activity.destroy({ account_id: accountId });
    await db.t_instance.destroy({ account_id: accountId });
    await db.t_invitation.destroy({ account_id: accountId });
    await db.t_account.destroy({ id: accountId });
  }

  return {
    resendConfirmationEmail,
    getAllAccounts,
    deleteAccount,
  };
};
