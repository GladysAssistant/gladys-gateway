const Promise = require('bluebird');
const crypto = require('crypto');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const {
  AlreadyExistError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BadRequestError,
} = require('../../common/error');

module.exports = function AccountModel(logger, db, redisClient, stripeService, mailService, telegramService) {
  async function getUsers(user) {
    // get the account_id of the currently connected user
    const userWithAccount = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'account_id'] },
    );

    // get list of user with same account
    const users = await db.t_user.find(
      {
        account_id: userWithAccount.account_id,
        is_deleted: false,
      },
      { fields: ['id', 'name', 'profile_url', 'email', 'role', 'created_at'] },
    );

    const usersNotAccepted = await db.t_invitation.find(
      {
        account_id: userWithAccount.account_id,
        revoked: false,
        is_deleted: false,
        accepted: false,
      },
      { field: ['id', 'email', 'account_id', 'role', 'created_at'] },
    );

    const allUsers = [];

    users.forEach((userNotFromInvitation) => {
      const newUserNotFromInvitation = userNotFromInvitation;
      newUserNotFromInvitation.is_invitation = false;
      allUsers.push(newUserNotFromInvitation);
    });

    usersNotAccepted.forEach((userFromInvitation) => {
      const newUserFromInvitation = userFromInvitation;
      newUserFromInvitation.is_invitation = true;
      allUsers.push(newUserFromInvitation);
    });

    return allUsers;
  }

  async function createAccountFromStripeSession(session) {
    if (!session.customer || !session.subscription) {
      throw new ValidationError('Customer and subscription are required');
    }

    const role = 'admin';
    const language = session.locale ? session.locale.substr(0, 2).toLowerCase() : 'en';

    // we get subscription from stripe side
    const [subscription, customer] = await Promise.all([
      stripeService.getSubscription(session.subscription),
      stripeService.getCustomer(session.customer),
    ]);

    // we update the tax rate - Not needed anymore
    // await stripeService.addTaxRate(subscription.id);

    const { email } = customer;
    const stripeProductId = subscription?.items?.data[0]?.price?.product;

    // we first test if an account already exist with this email
    const account = await db.t_account.findOne({ name: email });

    // it means an account already exist with this email
    if (account !== null) {
      telegramService.sendAlert(
        `Customer email = ${email}, language = ${language} already have an account and paid on the website`,
      );
      throw new AlreadyExistError(`User ${email} already have an account!`);
    }

    const newAccount = {
      name: email,
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      current_period_end: new Date(subscription.current_period_end * 1000),
      status: 'active',
      plan: stripeProductId === process.env.STRIPE_LITE_PLAN_PRODUCT_ID ? 'lite' : 'plus',
    };

    const insertedAccount = await db.t_account.insert(newAccount);

    // generate email confirmation token
    const token = (await randomBytes(64)).toString('hex');

    // we hash the token in DB so it's not possible to get the token
    // if the DB is compromised in read-only
    // (due to SQL injection for example)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await db.t_invitation.insert({
      email,
      role,
      token_hash: tokenHash,
      account_id: insertedAccount.id,
    });

    await mailService.send({ email, language }, 'welcome', {
      confirmationUrlGladys4: `${process.env.GLADYS_PLUS_FRONTEND_URL}/signup-gateway?token=${encodeURI(token)}`,
    });

    telegramService.sendAlert(`New customer ! Customer email = ${email}, language = ${language}`);

    return insertedAccount;
  }

  async function subscribeMonthlyPlan(user, sourceId) {
    // get the account_id of the currently connected user
    const userWithAccount = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'email', 'account_id'] },
    );

    // get the account to verify the user has not already subscribed
    const account = await db.t_account.findOne(
      {
        id: userWithAccount.account_id,
      },
      { fields: ['id', 'stripe_customer_id'] },
    );

    // account with stripe_customer_id already exist, don't make him subscribe again!
    if (account.stripe_customer_id) {
      throw new AlreadyExistError('Customer', account.id);
    }

    // create the customer on stripe side
    const customer = await stripeService.createCustomer(userWithAccount.email, sourceId);

    // contact stripe to save the subscription id
    let subscription = await stripeService.subscribeToMonthlyPlan(customer.id);

    // it means stripe is disabled
    // so we add to the account 100 years of life
    if (subscription === null) {
      subscription = {
        id: 'stripe-subcription-sample',
        current_period_end: new Date().getTime() + 100 * 365 * 24 * 60 * 60 * 1000,
      };
    }

    const toUpdate = {
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      current_period_end: new Date(subscription.current_period_end * 1000),
    };

    const accountUpdated = await db.t_account.update(userWithAccount.account_id, toUpdate, {
      fields: ['id', 'current_period_end'],
    });

    return accountUpdated;
  }

  async function subscribeMonthlyPlanWithoutAccount(rawEmail, language) {
    const email = rawEmail.trim().toLowerCase();
    const role = 'admin';

    // we first test if an account already exist with this email
    const account = await db.t_account.findOne({ name: email });

    // it means an account already exist with this email
    if (account !== null) {
      throw new AlreadyExistError();
    }

    // create the customer on stripe side
    const customer = await stripeService.createCustomer(email);

    // contact stripe to save the subscription id
    let subscription = await stripeService.subscribeToMonthlyPlan(customer.id);

    // it means stripe is disabled
    // so we add to the account 100 years of life
    if (subscription === null) {
      subscription = {
        id: 'stripe-subcription-sample',
        current_period_end: new Date().getTime() + 100 * 365 * 24 * 60 * 60 * 1000,
      };
    }

    const newAccount = {
      name: email,
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      current_period_end: new Date(subscription.current_period_end * 1000),
      status: 'trialing',
    };

    const insertedAccount = await db.t_account.insert(newAccount);

    // generate email confirmation token
    const token = (await randomBytes(64)).toString('hex');

    // we hash the token in DB so it's not possible to get the token
    // if the DB is compromised in read-only
    // (due to SQL injection for example)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await db.t_invitation.insert({
      email,
      role,
      token_hash: tokenHash,
      account_id: insertedAccount.id,
    });

    await mailService.send({ email, language }, 'welcome', {
      confirmationUrlGladys4: `${process.env.GLADYS_PLUS_FRONTEND_URL}/signup-gateway?token=${encodeURI(token)}`,
    });

    return insertedAccount;
  }

  async function updateCard(user, sourceId) {
    // get the account_id of the currently connected user
    const userWithAccount = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'email', 'account_id'] },
    );

    // get the account
    const account = await db.t_account.findOne(
      {
        id: userWithAccount.account_id,
      },
      { fields: ['id', 'stripe_customer_id'] },
    );

    // update the customer on stripe side
    const customer = await stripeService.updateCard(account.stripe_customer_id, sourceId);

    return customer;
  }

  async function getCard(user) {
    // get the account_id of the currently connected user
    const userWithAccount = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'email', 'account_id'] },
    );

    // get the account
    const account = await db.t_account.findOne(
      {
        id: userWithAccount.account_id,
      },
      { fields: ['id', 'stripe_customer_id', 'stripe_subscription_id'] },
    );

    // get card
    const [card, subscription] = await Promise.all([
      stripeService.getCard(account.stripe_customer_id),
      stripeService.getSubscription(account.stripe_subscription_id),
    ]);

    // we add subscription cancellation
    if (card && subscription) {
      if (subscription.canceled_at) {
        card.canceled_at = new Date(subscription.canceled_at * 1000);
      } else {
        card.canceled_at = null;
      }
      card.current_period_end = new Date(subscription.current_period_end * 1000);
    }

    return card;
  }

  async function cancelMonthlySubscription(user) {
    // get the account_id of the currently connected user
    const userWithAccount = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'email', 'account_id'] },
    );

    // get the account
    const account = await db.t_account.findOne(
      {
        id: userWithAccount.account_id,
      },
      { fields: ['id', 'stripe_customer_id', 'stripe_subscription_id'] },
    );

    return stripeService.cancelMonthlySubscription(account.stripe_subscription_id);
  }

  async function upgradeFromMonthlyToYearly(user) {
    // get the account_id of the currently connected user
    const userWithAccount = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'email', 'account_id'] },
    );

    // get the account
    const account = await db.t_account.findOne(
      {
        id: userWithAccount.account_id,
      },
      { fields: ['id', 'stripe_customer_id', 'stripe_subscription_id'] },
    );

    telegramService.sendAlert(
      `💰 Customer upgrading from monthly to yearly. Customer email = ${userWithAccount.email}`,
    );

    return stripeService.updateCustomerFromMonthlyToYearly(account.stripe_subscription_id);
  }

  async function getUserCurrentPlan(user) {
    // get the account_id of the currently connected user
    const userWithAccount = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'email', 'account_id'] },
    );

    // get the account
    const account = await db.t_account.findOne(
      {
        id: userWithAccount.account_id,
      },
      { fields: ['id', 'stripe_customer_id', 'stripe_subscription_id'] },
    );

    const subscription = await stripeService.getSubscription(account.stripe_subscription_id);
    const firstPrice = subscription?.items?.data[0]?.price?.id;
    if (firstPrice === process.env.STRIPE_MONTHLY_PLAN_ID) {
      return { plan: 'monthly' };
    }
    if (firstPrice === process.env.STRIPE_YEARLY_PLAN_ID) {
      return { plan: 'yearly' };
    }
    throw new BadRequestError('Unknown plan');
  }

  async function subscribeAgainToMonthlySubscription(user) {
    // get the account_id of the currently connected user
    const userWithAccount = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'email', 'account_id'] },
    );

    // get the account
    const account = await db.t_account.findOne(
      {
        id: userWithAccount.account_id,
      },
      { fields: ['id', 'stripe_customer_id'] },
    );

    // contact stripe to save the subscription id
    let subscription = await stripeService.subscribeToMonthlyPlan(account.stripe_customer_id);

    // it means stripe is disabled
    // so we add to the account 100 years of life
    if (subscription === null) {
      subscription = {
        id: 'stripe-subcription-sample',
        current_period_end: new Date().getTime() + 100 * 365 * 24 * 60 * 60 * 1000,
      };
    }

    const toUpdate = {
      stripe_subscription_id: subscription.id,
      current_period_end: new Date(subscription.current_period_end * 1000),
    };

    const accountUpdated = await db.t_account.update(userWithAccount.account_id, toUpdate, {
      fields: ['id', 'current_period_end'],
    });

    return accountUpdated;
  }

  async function stripeEvent(body, signature) {
    const event = stripeService.verifyEvent(body, signature);

    let account;
    let usersInAccount;
    let email;
    let language = 'fr'; // default language is in fr

    if (event.data && event.data.object && event.data.object.customer && event.type !== 'checkout.session.completed') {
      // we get the account linked to the customer
      account = await db.t_account.findOne({
        stripe_customer_id: event.data.object.customer,
      });
      if (!account) {
        logger.warn(`Stripe Webhook : Account with stripe customer "${event.data.object.customer}" not found.`);
        return Promise.resolve();
      }
      email = account.name;
      // we get the users in this account
      usersInAccount = await db.t_user.find(
        {
          account_id: account.id,
          is_deleted: false,
        },
        {
          fields: ['id', 'language'],
        },
      );
      if (usersInAccount.length > 0) {
        // eslint-disable-next-line prefer-destructuring
        language = usersInAccount[0].language;
      } else {
        language = 'fr';
      }
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await createAccountFromStripeSession(event.data.object);
        break;
      case 'charge.succeeded': {
        // get currentPeriodEnd threw the API
        const currentPeriodEnd = await stripeService.getSubscriptionCurrentPeriodEnd(account.stripe_subscription_id);

        // update current_period_end in DB
        await db.t_account.update(
          account.id,
          {
            current_period_end: new Date(currentPeriodEnd * 1000),
          },
          {
            fields: ['id', 'current_period_end'],
          },
        );

        break;
      }

      case 'customer.subscription.trial_will_end':
        if (language && email) {
          await mailService.send({ email, language }, 'trial_will_end', {
            updateCardLink: `${process.env.GLADYS_PLUS_BACKEND_URL}/accounts/stripe_customer_portal/${account.stripe_portal_key}`,
          });
        }

        telegramService.sendAlert(`Trial will end! Customer email = ${email}, language = ${language}`);

        break;

      case 'customer.subscription.updated':
        // eslint-disable-next-line no-case-declarations
        const stripeProductId = event.data.object.items?.data[0]?.price?.product;
        // Update status
        await db.t_account.update(
          account.id,
          {
            status: event.data.object.status,
            current_period_end:
              event.data.object.status === 'active' || event.data.object.status === 'trialing'
                ? new Date(event.data.object.current_period_end * 1000)
                : new Date(),
            plan: stripeProductId === process.env.STRIPE_LITE_PLAN_PRODUCT_ID ? 'lite' : 'plus',
          },
          {
            fields: ['id'],
          },
        );
        break;

      case 'invoice.payment_succeeded': {
        const invoicePaymentSucceededActivity = {
          stripe_event: event.type,
          account_id: account.id,
          hosted_invoice_url: event.data.object.hosted_invoice_url,
          invoice_pdf: event.data.object.invoice_pdf,
          amount_paid: event.data.object.amount_paid,
          closed: event.data.object.closed,
          currency: event.data.object.currency,
          params: event,
        };

        await db.t_account_payment_activity.insert(invoicePaymentSucceededActivity);
        break;
      }

      case 'invoice.payment_failed': {
        const activity = {
          stripe_event: event.type,
          account_id: account.id,
          hosted_invoice_url: event.data.object.hosted_invoice_url,
          invoice_pdf: event.data.object.invoice_pdf,
          amount_paid: event.data.object.amount_paid,
          closed: event.data.object.closed,
          currency: event.data.object.currency,
          params: event,
        };

        await db.t_account_payment_activity.insert(activity);

        if (language && email) {
          await mailService.send({ email, language }, 'payment_failed', {
            updateCardLink: `${process.env.GLADYS_PLUS_BACKEND_URL}/accounts/stripe_customer_portal/${account.stripe_portal_key}`,
          });
        }

        telegramService.sendAlert(`Payment failed! Customer email = ${email}, language = ${language}`);

        break;
      }

      case 'customer.subscription.deleted':
        // subscription is canceled, remove the client
        telegramService.sendAlert(`Subscription canceled! Customer email = ${email}, language = ${language}`);
        break;

      default:
        break;
    }

    return Promise.resolve();
  }

  async function revokeUser(user, userIdToRevoke) {
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

    if (userIdToRevoke === user.id) {
      throw new ForbiddenError('You cannot remove yourself from an account');
    }

    const userToRevoke = await db.t_user.findOne(
      {
        id: userIdToRevoke,
        account_id: userWithAccount.account_id,
        is_deleted: false,
      },
      { fields: ['id', 'role', 'account_id'] },
    );

    if (userIdToRevoke === null) {
      throw new NotFoundError();
    }

    // deleting user
    const deletedUser = await db.t_user.update(userToRevoke.id, {
      is_deleted: true,
    });

    // disonnect all connected devices
    await db.t_device.update(
      {
        user_id: userIdToRevoke,
        revoked: false,
      },
      {
        revoked: true,
      },
    );

    return deletedUser;
  }

  async function getInvoices(user) {
    // get the account_id of the currently connected user
    const userWithAccount = await db.t_user.findOne(
      {
        id: user.id,
      },
      { fields: ['id', 'email', 'account_id'] },
    );

    // get the invoices
    const invoices = await db.t_account_payment_activity.find(
      {
        account_id: userWithAccount.account_id,
        stripe_event: 'invoice.payment_succeeded',
      },
      {
        fields: ['id', 'hosted_invoice_url', 'invoice_pdf', 'amount_paid', 'created_at'],
        order: [
          {
            field: 'created_at',
            direction: 'desc',
          },
        ],
      },
    );

    return invoices;
  }

  async function createPaymentSession(locale) {
    if (['en', 'fr'].indexOf(locale) === -1) {
      throw new ValidationError('Locale can only be en or fr');
    }
    const session = await stripeService.createSession(locale);
    return {
      id: session.id,
    };
  }

  async function createBillingPortalSession(stripePortalKey, geo) {
    const account = await db.t_account.findOne({
      stripe_portal_key: stripePortalKey,
    });
    if (account === null) {
      throw new NotFoundError('Account not found');
    }
    telegramService.sendAlert(`Customer opening billing portal, email = ${account.name}, country = ${geo?.country}`);
    return stripeService.createBillingPortalSession(account.stripe_customer_id);
  }

  async function getAllAccounts() {
    const accounts = await db.t_account.find({}, { field: ['id', 'name', 'created_at'] });
    return accounts;
  }

  return {
    getUsers,
    updateCard,
    revokeUser,
    subscribeMonthlyPlan,
    cancelMonthlySubscription,
    subscribeAgainToMonthlySubscription,
    subscribeMonthlyPlanWithoutAccount,
    stripeEvent,
    getCard,
    getInvoices,
    createPaymentSession,
    createBillingPortalSession,
    getAllAccounts,
    upgradeFromMonthlyToYearly,
    getUserCurrentPlan,
  };
};
