const { AlreadyExistError } = require('../../common/error');

module.exports = function AccountModel(logger, db, redisClient, stripeService) {

  async function getUsers(user) {
    
    // get the account_id of the currently connected user
    var userWithAccount = await db.t_user.findOne({
      id: user.id
    }, {fields: ['id', 'account_id']});

    // get list of user with same account
    var users = await db.t_user.find({
      account_id: userWithAccount.account_id,
      is_deleted: false
    }, {fields: ['id', 'name', 'email', 'role', 'created_at']});

    var usersNotAccepted = await db.t_invitation.find({
      account_id: userWithAccount.account_id,
      revoked: false,
      is_deleted: false,
      accepted: false
    }, {field: ['id', 'email', 'account_id', 'role', 'created_at']});

    var allUsers = users.concat(usersNotAccepted);

    return allUsers;
  }

  async function subscribeMonthlyPlan(user, sourceId) {
    
    // get the account_id of the currently connected user
    var userWithAccount = await db.t_user.findOne({
      id: user.id
    }, {fields: ['id', 'email', 'account_id']});

    // get the account to verify the user has not already subscribed
    var account = await db.t_account.findOne({
      id: userWithAccount.account_id
    }, {fields: ['id', 'stripe_customer_id']});

    // account with stripe_customer_id already exist, don't make him subscribe again!
    if(account.stripe_customer_id) {
      throw new AlreadyExistError('Customer', account.id);
    }

    // create the customer on stripe side
    var customer = await stripeService.createCustomer(userWithAccount.email, sourceId);

    // contact stripe to save the subscription id
    var subscription = await stripeService.subscribeToMonthlyPlan(customer.id);

    // it means stripe is disabled
    // so we add to the account 100 years of life
    if(subscription === null) {
      subscription = {
        id: 'stripe-subcription-sample',
        current_period_end: new Date().getTime() + 100*365*24*60*60*1000
      };
    }

    var toUpdate = {
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      current_period_end: new Date(subscription.current_period_end * 1000)
    };

    var accountUpdated = await db.t_account.update(userWithAccount.account_id, toUpdate, {
      fields: ['id', 'current_period_end']
    });

    return accountUpdated;
  }

  async function stripeEvent(body, signature) {
    var event = stripeService.verifyEvent(body, signature);

    console.log(event);

    var account;

    if(event.data && event.data.object && event.data.object.customer) {
      
      // we get the account linked to the customer
      account = await db.t_account.findOne({
        stripe_customer_id: event.data.object.customer
      });
    } else {
      return Promise.resolve();
    }

    if(!account) {
      logger.warn(`Stripe Webhook : Account with stripe customer "${event.data.object.customer}" not found.`);
      return Promise.resolve();
    }

    switch(event.type) {
    
    case 'charge.succeeded':

      // get currentPeriodEnd threw the API
      var currentPeriodEnd = await stripeService.getSubscriptionCurrentPeriodEnd(account.stripe_subscription_id);

      // update current_period_end in DB
      await db.t_account.update(account.id, {
        current_period_end: new Date(currentPeriodEnd*1000)
      }, {
        fields: ['id', 'current_period_end']
      });

      break;

    case 'invoice.payment_succeeded':
      
      var activity = {
        stripe_event: event.type,
        account_id: account.id,
        hosted_invoice_url: event.data.object.hosted_invoice_url,
        invoice_pdf: event.data.object.invoice_pdf,
        amount_paid: event.data.object.amount_paid,
        closed: event.data.object.closed,
        currency: event.data.object.currency,
        params: event
      };

      await db.t_account_payment_activity.insert(activity);

      break;

    case 'invoice.payment_failed':
      
      var activity = {
        stripe_event: event.type,
        account_id: account.id,
        hosted_invoice_url: event.data.object.hosted_invoice_url,
        invoice_pdf: event.data.object.invoice_pdf,
        amount_paid: event.data.object.amount_paid,
        closed: event.data.object.closed,
        currency: event.data.object.currency,
        params: event
      };

      await db.t_account_payment_activity.insert(activity);

      break;

    case 'customer.subscription.deleted':
      // subscription is canceled, remove the client
      break;
    } 
  }

  return {
    getUsers,
    subscribeMonthlyPlan,
    stripeEvent
  };
};