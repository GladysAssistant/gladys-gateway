const Joi = require('joi');
const Promise = require('bluebird');
const { NotFoundError, ForbiddenError, ValidationError } = require('../../common/error');
const { adminListAccountsQuerySchema } = require('../../common/schema');

const uuidSchema = Joi.string().guid({ version: 'uuidv4' }).required();

// Fields of t_user an admin is allowed to see. Never the SRP verifier, the encrypted
// private keys, the two factor secret or the recovery code hashes.
const USER_PUBLIC_FIELDS = [
  'id',
  'email',
  'name',
  'role',
  'language',
  'email_confirmed',
  'two_factor_enabled',
  'gladys_user_id',
  'gladys_4_user_id',
  'account_id',
  'created_at',
  'updated_at',
];

const ACCOUNT_PUBLIC_FIELDS = [
  'id',
  'name',
  'plan',
  'status',
  'current_period_end',
  'stripe_customer_id',
  'stripe_subscription_id',
  'created_at',
  'updated_at',
];

function pick(row, fields) {
  return fields.reduce((result, field) => ({ ...result, [field]: row[field] }), {});
}

// "%" and "_" are wildcards in ILIKE, they must be escaped in the user search term
function toLikePattern(search) {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}

module.exports = function AdminAccountModel(logger, db, stripeService, enedisModel) {
  function validateId(id) {
    const { error } = uuidSchema.validate(id);
    if (error) {
      throw new NotFoundError();
    }
  }

  async function getAccountOrFail(accountId) {
    validateId(accountId);
    const account = await db.t_account.findOne({ id: accountId });
    if (account === null) {
      throw new NotFoundError('Account not found');
    }
    return account;
  }

  async function getUserOrFail(userId) {
    validateId(userId);
    const user = await db.t_user.findOne({ id: userId });
    if (user === null) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  /**
   * Paginated list of accounts. "search" matches the account email, the email of one of its
   * users (case insensitive, partial) or an exact account/user id.
   */
  async function listAccounts(query) {
    const { error, value } = adminListAccountsQuerySchema.validate(query, { stripUnknown: true, abortEarly: false });
    if (error) {
      throw new ValidationError('admin_list_accounts', error);
    }
    const search = value.search ? value.search : null;
    const likePattern = search ? toLikePattern(search) : null;
    const request = `
      SELECT
        a.id, a.name, a.plan, a.status, a.current_period_end, a.created_at, a.updated_at,
        COUNT(u.id)::int AS user_count,
        COUNT(*) OVER()::int AS total_count
      FROM t_account a
      LEFT JOIN t_user u ON u.account_id = a.id
      WHERE $1::text IS NULL
        OR a.name ILIKE $2
        OR a.id::text = $1
        OR EXISTS (
          SELECT 1 FROM t_user su
          WHERE su.account_id = a.id AND (su.email ILIKE $2 OR su.id::text = $1)
        )
      GROUP BY a.id
      ORDER BY a.created_at DESC
      LIMIT $3 OFFSET $4;
    `;
    const rows = await db.query(request, [search, likePattern, value.limit, value.offset]);
    const total = rows.length > 0 ? rows[0].total_count : 0;
    return {
      total,
      limit: value.limit,
      offset: value.offset,
      accounts: rows.map(({ total_count: totalCount, ...account }) => account),
    };
  }

  async function getStripeSummary(account) {
    if (!account.stripe_subscription_id) {
      return null;
    }
    try {
      const subscription = await stripeService.getSubscription(account.stripe_subscription_id);
      return {
        subscription_id: subscription.id,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      };
    } catch (e) {
      // Stripe being down should not prevent the admin from seeing the account
      logger.warn(`Admin API: unable to fetch Stripe subscription of account ${account.id}`);
      logger.warn(e);
      return null;
    }
  }

  async function getAccount(accountId) {
    const account = await getAccountOrFail(accountId);
    const [users, instances, backups, usagePoints, stripe] = await Promise.all([
      db.t_user.find({ account_id: accountId }, { fields: USER_PUBLIC_FIELDS, order: [{ field: 'created_at' }] }),
      db.t_instance.find(
        { account_id: accountId },
        { fields: ['id', 'name', 'primary_instance', 'created_at', 'updated_at'], order: [{ field: 'created_at' }] },
      ),
      db.t_backup.find(
        { account_id: accountId },
        {
          fields: ['id', 'size', 'status', 'created_at', 'updated_at'],
          order: [{ field: 'created_at', direction: 'desc' }],
          limit: 5,
        },
      ),
      db.t_enedis_usage_point.find({ account_id: accountId }, { fields: ['usage_point_id', 'created_at'] }),
      getStripeSummary(account),
    ]);
    const devicesByUser = await db.query(
      `
        SELECT user_id,
          COUNT(*) FILTER (WHERE revoked = false)::int AS active_count,
          MAX(last_seen) AS last_seen
        FROM t_device
        WHERE user_id = ANY($1::uuid[])
        GROUP BY user_id;
      `,
      [users.map((user) => user.id)],
    );
    const devicesByUserId = new Map(devicesByUser.map((row) => [row.user_id, row]));
    return {
      account: pick(account, ACCOUNT_PUBLIC_FIELDS),
      users: users.map((user) => {
        const devices = devicesByUserId.get(user.id);
        return {
          ...user,
          devices: {
            active_count: devices ? devices.active_count : 0,
            last_seen: devices ? devices.last_seen : null,
          },
        };
      }),
      instances,
      backups,
      enedis_usage_points: usagePoints,
      stripe,
    };
  }

  /**
   * Disable the second factor of a user who lost access to his authenticator. The user will
   * be able to login with his password only and to configure a new second factor.
   * Existing sessions are kept.
   */
  async function resetTwoFactor(userId) {
    await getUserOrFail(userId);
    const [updatedUser] = await db.t_user.update(
      { id: userId },
      {
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_recovery_codes: null,
      },
      { fields: USER_PUBLIC_FIELDS },
    );
    logger.warn(`Admin API: two factor authentication reset for user ${userId}`);
    return updatedUser;
  }

  /**
   * Delete one user of an account (an invited user for example) and everything attached to
   * him. The last user of an account cannot be deleted this way: the whole account must be
   * deleted instead, so that backups, Stripe data and Enedis data are cleaned as well.
   */
  async function deleteUser(userId) {
    const user = await getUserOrFail(userId);
    const otherUsers = await db.t_user.count({ account_id: user.account_id, 'id <>': userId });
    if (Number(otherUsers) === 0) {
      throw new ForbiddenError('Cannot delete the last user of an account, delete the account instead');
    }
    await db.t_device.destroy({ user_id: userId });
    await db.t_history.destroy({ user_id: userId });
    await db.t_open_api_key.destroy({ user_id: userId });
    await db.t_reset_password.destroy({ user_id: userId });
    await db.t_user.destroy({ id: userId });
    logger.warn(`Admin API: user ${userId} of account ${user.account_id} deleted`);
  }

  /**
   * Enedis synchronization state of an account: for each usage point, the last syncs and
   * how much data is stored (and how recent it is).
   */
  async function getEnedisState(accountId) {
    await getAccountOrFail(accountId);
    const usagePoints = await db.t_enedis_usage_point.find(
      { account_id: accountId },
      { fields: ['usage_point_id', 'created_at'], order: [{ field: 'created_at' }] },
    );
    const enrichedUsagePoints = await Promise.map(
      usagePoints,
      async (usagePoint) => {
        const [syncs, [dailyConsumption], [consumptionLoadCurve]] = await Promise.all([
          db.t_enedis_sync.find(
            { usage_point_id: usagePoint.usage_point_id },
            { order: [{ field: 'created_at', direction: 'desc' }], limit: 10 },
          ),
          db.query(
            `SELECT COUNT(*)::int AS count, MAX(created_at) AS last_date
             FROM t_enedis_daily_consumption WHERE usage_point_id = $1;`,
            [usagePoint.usage_point_id],
          ),
          db.query(
            `SELECT COUNT(*)::int AS count, MAX(created_at) AS last_date
             FROM t_enedis_consumption_load_curve WHERE usage_point_id = $1;`,
            [usagePoint.usage_point_id],
          ),
        ]);
        return {
          ...usagePoint,
          syncs,
          daily_consumption: dailyConsumption,
          consumption_load_curve: consumptionLoadCurve,
        };
      },
      { concurrency: 3 },
    );
    return { usage_points: enrichedUsagePoints };
  }

  /**
   * Queue a full refresh of the Enedis data of an account. The job is keyed by user
   * (see core/enedis/enedis.js), the admin user of the account is used.
   */
  async function refreshEnedisData(accountId) {
    await getAccountOrFail(accountId);
    const users = await db.t_user.find(
      { account_id: accountId },
      { fields: ['id', 'role'], order: [{ field: 'created_at' }] },
    );
    if (users.length === 0) {
      throw new NotFoundError('This account has no user');
    }
    const user = users.find((u) => u.role === 'admin') || users[0];
    await enedisModel.refreshAlldata(user.id);
    logger.warn(`Admin API: Enedis full refresh queued for account ${accountId}`);
  }

  return {
    listAccounts,
    getAccount,
    resetTwoFactor,
    deleteUser,
    getEnedisState,
    refreshEnedisData,
  };
};
