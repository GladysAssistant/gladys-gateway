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
    }, {field: ['id', 'email', 'account_id', 'created_at']});

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

    switch(event.type) {
    
    case 'charge.succeeded':

      if(event.data && event.data.object && event.data.object.customer) {
        
        // we get the account linked to the customer
        var account = await db.t_account.findOne({
          stripe_customer_id: event.data.object.customer
        });

        // get currentPeriodEnd threw the API
        var currentPeriodEnd = await stripeService.getSubscriptionCurrentPeriodEnd(account.stripe_subscription_id);

        // update current_period_end in DB
        var updated = await db.t_account.update(account.id, {
          current_period_end: new Date(currentPeriodEnd*1000)
        }, {
          fields: ['id', 'current_period_end']
        });

        console.log(updated);
      }

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