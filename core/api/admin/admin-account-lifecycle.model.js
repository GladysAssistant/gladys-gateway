const Promise = require('bluebird');
const crypto = require('crypto');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const { ValidationError } = require('../../common/error');
const { adminLifecycleJobSchema } = require('../../common/schema');
const { normalizeEmail } = require('../../common/normalize-email');
const { buildAccountDeletionWarningScope, buildWelcomeReminderScope } = require('../../common/billing-email-scope');

// Statuses under which the customer has access to Gladys Plus (see checkUserPlan middleware)
const ACTIVE_STATUSES = ['active', 'trialing'];

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
// Stripe calls in parallel while reconciling: low enough to stay far from the rate limit
const STRIPE_CONCURRENCY = 4;

function readPositiveIntegerEnv(name, defaultValue) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

// How long after the welcome email a customer who never activated the account is reminded.
function getActivationReminderPolicy() {
  return {
    delay_in_days: readPositiveIntegerEnv('ACCOUNT_ACTIVATION_REMINDER_DELAY_IN_DAYS', 7),
  };
}

// How long an account whose subscription is over is kept before being warned, then deleted.
// The customer keeps his backups during the grace period: re-subscribing through Stripe
// Checkout re-links the same account (see createAccountFromStripeSession).
function getRetentionPolicy() {
  return {
    grace_period_in_days: readPositiveIntegerEnv('ACCOUNT_RETENTION_GRACE_PERIOD_IN_DAYS', 180),
    warning_period_in_days: readPositiveIntegerEnv('ACCOUNT_RETENTION_WARNING_PERIOD_IN_DAYS', 30),
  };
}

function toDate(value) {
  return value ? new Date(value) : null;
}

function toIsoString(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function sameInstant(a, b) {
  const dateA = toDate(a);
  const dateB = toDate(b);
  if (dateA === null || dateB === null) {
    return dateA === dateB;
  }
  // Stripe timestamps are in seconds
  return Math.floor(dateA.getTime() / 1000) === Math.floor(dateB.getTime() / 1000);
}

/**
 * Date the access of the account ends (or ended), derived from the Stripe subscription.
 * - active / trialing: the end of the current paid period, as the webhooks maintain it.
 * - anything else: access is over. A date already in the past in database is kept (it was
 *   set when the subscription became past_due, and the retention policy counts from it),
 *   otherwise the end of the subscription on Stripe side, or now if Stripe has none.
 */
function getSubscriptionPeriodEnd(subscription) {
  // Recent Stripe API versions carry the period on the subscription items
  return subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end || null;
}

function computeAccessEnd(account, subscription, now) {
  if (ACTIVE_STATUSES.includes(subscription.status)) {
    const periodEnd = getSubscriptionPeriodEnd(subscription);
    return periodEnd ? new Date(periodEnd * 1000) : null;
  }
  const accessEndInDatabase = toDate(account.current_period_end);
  if (accessEndInDatabase && accessEndInDatabase <= now) {
    return accessEndInDatabase;
  }
  const endedAtOnStripe = subscription.ended_at || subscription.canceled_at;
  if (endedAtOnStripe && endedAtOnStripe * 1000 <= now.getTime()) {
    return new Date(endedAtOnStripe * 1000);
  }
  return now;
}

module.exports = function AdminAccountLifecycleModel(logger, db, stripeService, mailService, adminModel) {
  function validateJobBody(body) {
    const { error, value } = adminLifecycleJobSchema.validate(body || {}, { stripUnknown: true, abortEarly: false });
    if (error) {
      throw new ValidationError('admin_lifecycle_job', error);
    }
    return value;
  }

  async function syncOneAccountWithStripe(account, execute, now) {
    const before = {
      status: account.status,
      plan: account.plan,
      current_period_end: toIsoString(account.current_period_end),
    };
    const result = { id: account.id, name: account.name, before, after: before, changed: false };
    let subscription;
    let subscriptionMissing = false;
    try {
      subscription = await stripeService.getSubscription(account.stripe_subscription_id);
    } catch (e) {
      if (e.code !== 'resource_missing') {
        logger.warn(`syncWithStripe: unable to fetch subscription ${account.stripe_subscription_id} of ${account.id}`);
        logger.warn(e);
        return { ...result, error: e.code || e.type || e.message || 'stripe_error' };
      }
      // The subscription no longer exists on Stripe (customer deleted for example): it is
      // certainly over. The plan is kept, the end of access is the one known or now.
      subscriptionMissing = true;
      subscription = { status: 'canceled' };
    }
    const stripeProductId = subscription.items?.data?.[0]?.price?.product;
    const planOnStripe = stripeProductId === process.env.STRIPE_LITE_PLAN_PRODUCT_ID ? 'lite' : 'plus';
    const after = {
      status: subscription.status,
      plan: subscriptionMissing ? before.plan : planOnStripe,
      current_period_end: toIsoString(computeAccessEnd(account, subscription, now)),
    };
    const changed =
      after.status !== before.status ||
      after.plan !== before.plan ||
      !sameInstant(after.current_period_end, before.current_period_end);
    if (changed && execute) {
      // The subscription id is part of the predicate: an account re-linked to a new
      // subscription in the meantime (re-subscription) must not receive the old values.
      const updatedAccounts = await db.t_account.update(
        { id: account.id, stripe_subscription_id: account.stripe_subscription_id },
        {
          status: after.status,
          plan: after.plan,
          current_period_end: after.current_period_end ? new Date(after.current_period_end) : null,
        },
        { fields: ['id'] },
      );
      if (updatedAccounts.length === 0) {
        logger.warn(`syncWithStripe: account ${account.id} was re-linked in the meantime, skipped`);
        return { ...result, after, changed: false, error: 'account_changed_in_the_meantime' };
      }
      logger.info(
        `syncWithStripe: account ${account.id} updated (${before.status}/${before.plan} -> ${after.status}/${after.plan})`,
      );
    }
    return { ...result, after, changed, ...(subscriptionMissing ? { stripe_subscription_missing: true } : {}) };
  }

  /**
   * Reconcile every account having a Stripe subscription with what Stripe holds: status,
   * plan and end of access. Missed or unhandled webhooks (an account stuck in past_due after
   * Stripe canceled the subscription for example) are repaired this way. Read-only unless
   * execute is true. The report only lists the accounts that differ or could not be checked.
   */
  async function syncWithStripe(body) {
    const { execute } = validateJobBody(body);
    const now = new Date();
    const accounts = await db.t_account.find(
      { 'stripe_subscription_id is not': null },
      {
        fields: ['id', 'name', 'status', 'plan', 'current_period_end', 'stripe_subscription_id'],
        order: [{ field: 'created_at' }],
      },
    );
    logger.info(`syncWithStripe: checking ${accounts.length} accounts (execute=${execute})`);
    const results = await Promise.map(accounts, (account) => syncOneAccountWithStripe(account, execute, now), {
      concurrency: STRIPE_CONCURRENCY,
    });
    const errors = results.filter((result) => result.error);
    const changed = results.filter((result) => result.changed);
    return {
      execute,
      total: accounts.length,
      checked: results.length - errors.length,
      changed: changed.length,
      errors: errors.length,
      accounts: results.filter((result) => result.changed || result.error),
    };
  }

  async function sendDeletionWarning(account, deletionDate) {
    const users = await db.t_user.find(
      { account_id: account.id, is_deleted: false },
      { fields: ['id', 'email', 'name', 'language'] },
    );
    // An account that was never activated has no user: the billing email is warned instead,
    // in the language of the checkout when known
    const recipients =
      users.length > 0 ? users : [{ email: account.name, name: null, language: account.language || null }];
    await Promise.mapSeries(recipients, (recipient) =>
      mailService.send(
        { email: recipient.email, language: recipient.language },
        'account_deletion_warning',
        buildAccountDeletionWarningScope({
          account,
          user: recipient,
          deletionDate,
          language: recipient.language,
        }),
      ),
    );
  }

  async function applyRetentionToOneAccount(account, policy, execute, now) {
    const accessEndedAt = new Date(account.access_ended_at);
    const warningSentAt = toDate(account.deletion_warning_sent_at);
    // A warning older than the end of access belongs to a previous life of the account (the
    // customer re-subscribed after being warned, then left again): a new warning is due.
    const warningIsValid = warningSentAt !== null && warningSentAt >= accessEndedAt;
    const result = {
      id: account.id,
      name: account.name,
      status: account.status,
      access_ended_at: accessEndedAt.toISOString(),
      deletion_warning_sent_at: warningIsValid ? warningSentAt.toISOString() : null,
    };
    try {
      // The database may lag behind Stripe (missed webhook, re-subscription on a newer
      // subscription): never warn nor delete a customer whose subscription is actually
      // running. syncWithStripe repairs such an account.
      if (account.stripe_subscription_id || account.stripe_customer_id) {
        const [runningSubscription] = await stripeService.getRunningSubscriptions(account);
        if (runningSubscription) {
          throw new Error(
            `Subscription ${runningSubscription.id} is ${runningSubscription.status} on Stripe, run sync-stripe`,
          );
        }
      }
      if (!warningIsValid) {
        const deletionDate = new Date(now.getTime() + policy.warning_period_in_days * ONE_DAY_IN_MS);
        if (execute) {
          await sendDeletionWarning(account, deletionDate);
          await db.t_account.update(account.id, { deletion_warning_sent_at: now }, { fields: ['id'] });
          logger.warn(`retention: deletion warning sent for account ${account.id}, deletion on ${deletionDate}`);
        }
        return { ...result, action: 'warn', deletion_date: deletionDate.toISOString() };
      }
      const deletionDate = new Date(warningSentAt.getTime() + policy.warning_period_in_days * ONE_DAY_IN_MS);
      if (deletionDate > now) {
        return { ...result, action: 'wait', deletion_date: deletionDate.toISOString() };
      }
      if (execute) {
        // deleteAccount checks Stripe again and refuses an account re-subscribed in the meantime
        await adminModel.deleteAccount(account.id);
        logger.warn(`retention: account ${account.id} deleted (access ended on ${result.access_ended_at})`);
      }
      return { ...result, action: 'delete', deletion_date: deletionDate.toISOString() };
    } catch (e) {
      logger.warn(`retention: failed to process account ${account.id}`);
      logger.warn(e);
      return { ...result, action: 'error', error: e.message || 'error' };
    }
  }

  /**
   * Retention policy of the accounts whose subscription is over (canceled, unpaid, never
   * converted...). Once the grace period has elapsed since the end of access, the users are
   * warned by email that the account and its backups will be deleted; once the warning
   * period has elapsed too, the account is deleted with everything attached (see
   * adminModel.deleteAccount). Internal accounts and accounts whose access has not ended are
   * never touched. The status in database is not trusted (a missed webhook leaves an account
   * "active" with an end of access long gone): Stripe is asked for every candidate instead.
   * Read-only unless execute is true.
   */
  async function applyRetentionPolicy(body) {
    const { execute } = validateJobBody(body);
    const policy = getRetentionPolicy();
    const now = new Date();
    const graceLimit = new Date(now.getTime() - policy.grace_period_in_days * ONE_DAY_IN_MS);
    // An account that never subscribed has no end of access: its creation date is used
    const candidates = await db.query(
      `
        SELECT id, name, plan, status, language, stripe_customer_id, stripe_subscription_id,
          current_period_end, created_at, deletion_warning_sent_at,
          COALESCE(current_period_end, created_at) AS access_ended_at
        FROM t_account
        WHERE is_internal = false
          AND COALESCE(current_period_end, created_at) < $1
        ORDER BY COALESCE(current_period_end, created_at) ASC;
      `,
      [graceLimit],
    );
    logger.info(`retention: ${candidates.length} accounts past the grace period (execute=${execute})`);
    const results = await Promise.mapSeries(candidates, (account) =>
      applyRetentionToOneAccount(account, policy, execute, now),
    );
    const countByAction = (action) => results.filter((result) => result.action === action).length;
    return {
      execute,
      ...policy,
      total: results.length,
      warned: countByAction('warn'),
      waiting: countByAction('wait'),
      deleted: countByAction('delete'),
      errors: countByAction('error'),
      accounts: results,
    };
  }

  async function sendActivationReminder(account, now) {
    const email = normalizeEmail(account.name);
    // The firstname is only on the Stripe customer: without it the email is still sent
    let customer = null;
    try {
      customer = await stripeService.getCustomer(account.stripe_customer_id);
    } catch (e) {
      logger.warn(`activationReminder: unable to fetch customer ${account.stripe_customer_id} of ${account.id}`);
      logger.warn(e);
    }
    // A fresh invitation, like the welcome email: the previous one stays valid too
    const token = (await randomBytes(64)).toString('hex');
    // we hash the token in DB so it's not possible to get the token if the DB is compromised in read-only
    // (due to SQL injection for example)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await db.t_invitation.insert({
      email,
      role: 'admin',
      token_hash: tokenHash,
      account_id: account.id,
    });
    await mailService.send(
      { email, language: account.language },
      'welcome_reminder',
      buildWelcomeReminderScope({
        confirmationUrlGladys4: `${process.env.GLADYS_PLUS_FRONTEND_URL}/signup-gateway?token=${encodeURI(token)}`,
        customer,
        account,
        language: account.language,
      }),
    );
    await db.t_account.update(account.id, { activation_reminder_sent_at: now }, { fields: ['id'] });
  }

  async function remindOneAccount(account, execute, now) {
    const result = {
      id: account.id,
      name: account.name,
      status: account.status,
      language: account.language,
      created_at: toIsoString(account.created_at),
    };
    try {
      // The status in database is the copy of the webhooks and may lag behind Stripe (a
      // missed customer.subscription.deleted leaves the account "active"): a customer whose
      // subscription is actually over is not reminded, syncWithStripe repairs the account.
      // Stripe unreachable is an error: the customer is not reminded either, next run will.
      const [runningSubscription] = await stripeService.getRunningSubscriptions(account);
      if (!runningSubscription) {
        return { ...result, action: 'skip', reason: 'subscription_not_running_on_stripe' };
      }
      if (execute) {
        await sendActivationReminder(account, now);
        logger.info(`activationReminder: reminder sent for account ${account.id}`);
      }
      return { ...result, action: 'remind' };
    } catch (e) {
      logger.warn(`activationReminder: failed to remind account ${account.id}`);
      logger.warn(e);
      return { ...result, action: 'error', error: e.message || 'error' };
    }
  }

  /**
   * Reminder for the customers who subscribed through Stripe Checkout but never activated
   * their Gladys Plus account: the welcome email invited them to, nobody clicked. Once the
   * delay has elapsed since the account was created (the welcome email is sent at that
   * moment), the billing email receives one reminder with a fresh activation link, in the
   * language of the checkout. Sent once per account: an account is a candidate only while
   * it has a running subscription (Stripe is asked, the status in database is not trusted),
   * no user and no reminder yet. Internal accounts are never touched. Read-only unless
   * execute is true. Scheduled daily by the scheduler service, the admin API is there to
   * review the candidates and to run it by hand.
   */
  async function sendActivationReminders(body) {
    const { execute } = validateJobBody(body);
    const policy = getActivationReminderPolicy();
    const now = new Date();
    const createdBefore = new Date(now.getTime() - policy.delay_in_days * ONE_DAY_IN_MS);
    const candidates = await db.query(
      `
        SELECT id, name, plan, status, language, stripe_customer_id, current_period_end, created_at
        FROM t_account
        WHERE is_internal = false
          AND is_deleted = false
          AND stripe_subscription_id IS NOT NULL
          AND status IN ('active', 'trialing')
          AND activation_reminder_sent_at IS NULL
          AND created_at < $1
          AND NOT EXISTS (
            SELECT 1 FROM t_user WHERE t_user.account_id = t_account.id AND t_user.is_deleted = false
          )
        ORDER BY created_at ASC;
      `,
      [createdBefore],
    );
    logger.info(`activationReminder: ${candidates.length} accounts not activated (execute=${execute})`);
    const results = await Promise.mapSeries(candidates, (account) => remindOneAccount(account, execute, now));
    const countByAction = (action) => results.filter((result) => result.action === action).length;
    return {
      execute,
      ...policy,
      total: results.length,
      reminded: countByAction('remind'),
      skipped: countByAction('skip'),
      errors: countByAction('error'),
      accounts: results,
    };
  }

  return {
    syncWithStripe,
    applyRetentionPolicy,
    sendActivationReminders,
  };
};
