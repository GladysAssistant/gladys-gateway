const Promise = require('bluebird');
var stripe = null;

if(process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

module.exports = function (logger) {

  async function createCustomer(email, source) {
    
    if(stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve({id: null});
    }

    const customer = await stripe.customers.create({
      email,
      source
    });

    return customer;
  }

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

  async function updateCard(stripeCustomerId, sourceId) {
     
    if(stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve(null);
    }

    var result = await stripe.customers.update(stripeCustomerId, {
      source: sourceId
    });

    return result;
  }

  async function getCard(stripeCustomerId) {
    
    if(stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve(null);
    }

    var customer = await stripe.customers.retrieve(stripeCustomerId);

    if(customer && customer.sources && customer.sources.data && customer.sources.data.length > 0) {
      var card = customer.sources.data[0];

      return {
        brand: card.brand,
        country: card.country,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        last4: card.last4 
      };
    } else {
      return null;
    }
  }

  async function getSubscription(stripeSubscriptionId) {
    return stripe.subscriptions.retrieve(stripeSubscriptionId);
  }

  async function cancelMonthlySubscription(stripeSubscriptionId) {
    
    if(stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve(null);
    }

    return stripe.subscriptions.del(stripeSubscriptionId);
  }

  async function getSubscriptionCurrentPeriodEnd(subscriptionId) {
    
    if(stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      var fakeEndDate = new Date().getTime() + 100*365*24*60*60*1000;
      return Promise.resolve(fakeEndDate);
    }

    var subscription = await stripe.subscriptions.retrieve(subscriptionId);

    return subscription.current_period_end;
  }

  function verifyEvent(body, signature) {
    
    if(stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve(body);
    }

    return stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_ENDPOINT_SECRET);
  }

  return {
    subscribeToMonthlyPlan,
    cancelMonthlySubscription,
    createCustomer,
    getCard,
    updateCard,
    verifyEvent,
    getSubscriptionCurrentPeriodEnd,
    getSubscription
  };
};