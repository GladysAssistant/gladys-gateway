const Promise = require('bluebird');
var stripe = null;

if(process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

module.exports = function (logger) {

  async function subscribeToMonthlyPlan(stripeCustomerId) {
    
    if(stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve(null);
    }

    // subscribe customer to monthly plan
    var result = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{
        plan: process.env.STRIPE_MONTHLY_PLAN_ID
      }]
    });

    return result;
  }

  async function cancelMonthlySubscription(stripeSubscriptionId) {
    return stripe.subscriptions.del(stripeSubscriptionId);
  }

  return {
    subscribeToMonthlyPlan,
    cancelMonthlySubscription
  };
};