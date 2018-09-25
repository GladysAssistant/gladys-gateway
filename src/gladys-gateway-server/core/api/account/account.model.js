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
    }, {fields: ['id', 'name', 'email']});

    return users;
  }

  async function subscribeMonthlyPlan(user, stripeCustomerId) {
    
    // get the account_id of the currently connected user
    var userWithAccount = await db.t_user.findOne({
      id: user.id
    }, {fields: ['id', 'account_id']});

    // contact stripe to save the subscription id
    var subscription = await stripeService.subscribeToMonthlyPlan(stripeCustomerId);

    // it means stripe is disabled
    // so we add to the account 100 years of life
    if(subscription === null) {
      subscription = {
        id: 'stripe-subcription-sample',
        current_period_end: new Date().getTime() + 100*365*24*60*60*1000
      };
    }

    var toUpdate = {
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscription.id,
      current_period_end: new Date(subscription.current_period_end)
    };

    var accountUpdated = await db.t_account.update(userWithAccount.account_id, toUpdate, {
      fields: ['id', 'current_period_end']
    });

    return accountUpdated;
  }

  return {
    getUsers,
    subscribeMonthlyPlan
  };
};