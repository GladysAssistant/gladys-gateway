const Promise = require('bluebird');
const Stripe = require('stripe');

let stripe = null;

module.exports = function StripeService(logger) {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  }
  async function createCustomer(email) {
    if (stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve({ id: null });
    }

    const customer = await stripe.customers.create({
      email,
    });

    return customer;
  }

  async function subscribeToMonthlyPlan(stripeCustomerId) {
    if (stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve(null);
    }

    // subscribe customer to monthly plan
    const result = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      // default_tax_rates: [process.env.STRIPE_DEFAULT_TAX_RATE_ID],
      items: [
        {
          plan: process.env.STRIPE_MONTHLY_PLAN_ID,
        },
      ],
      trial_from_plan: true,
    });

    return result;
  }

  async function updateCard(stripeCustomerId, sourceId) {
    if (stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve(null);
    }

    const result = await stripe.customers.update(stripeCustomerId, {
      source: sourceId,
    });

    return result;
  }

  // A PaymentMethod is not always a card: customers coming through Stripe
  // Checkout or the customer portal can pay with PayPal, SEPA debit, Link...
  // The type-specific details (card number, PayPal email) live under a key
  // named after the type; only cards carry brand/expiry fields, the others
  // fall back to null and are identified by their type alone.
  function formatPaymentMethod(paymentMethod) {
    const details = paymentMethod[paymentMethod.type] || {};
    return {
      type: paymentMethod.type,
      brand: details.brand || null,
      country: details.country || null,
      exp_month: details.exp_month || null,
      exp_year: details.exp_year || null,
      last4: details.last4 || null,
    };
  }

  async function getCard(stripeCustomerId) {
    if (stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve(null);
    }

    // Both expansions matter: on recent Stripe API versions `sources` is no
    // longer included in the customer by default, and the default
    // PaymentMethod is otherwise returned as a bare id.
    const customer = await stripe.customers.retrieve(stripeCustomerId, {
      expand: ['sources', 'invoice_settings.default_payment_method'],
    });

    if (!customer) {
      return null;
    }

    // Modern flow: a PaymentMethod set as the customer's default for invoices
    // (what the customer portal configures). Checked first because it is also
    // what Stripe charges first when both it and a legacy source exist.
    const defaultPaymentMethod = customer.invoice_settings && customer.invoice_settings.default_payment_method;
    if (defaultPaymentMethod && typeof defaultPaymentMethod === 'object') {
      return formatPaymentMethod(defaultPaymentMethod);
    }

    // Legacy flow: a card saved as a customer source (Elements + Sources API)
    if (customer.sources && customer.sources.data && customer.sources.data.length > 0) {
      const card = customer.sources.data[0];

      return {
        type: 'card',
        brand: card.brand,
        country: card.country,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        last4: card.last4,
      };
    }
    return null;
  }

  // A subscription created through Stripe Checkout keeps the collected
  // PaymentMethod as its own default, without touching the customer object:
  // an account can have a perfectly valid payment method that only shows up
  // here.
  async function getSubscriptionDefaultPaymentMethod(stripeSubscriptionId) {
    if (stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve(null);
    }

    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ['default_payment_method'],
    });

    const defaultPaymentMethod = subscription && subscription.default_payment_method;
    if (defaultPaymentMethod && typeof defaultPaymentMethod === 'object') {
      return formatPaymentMethod(defaultPaymentMethod);
    }
    return null;
  }

  async function getSubscription(stripeSubscriptionId) {
    return stripe.subscriptions.retrieve(stripeSubscriptionId);
  }

  async function cancelMonthlySubscription(stripeSubscriptionId) {
    if (stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve(null);
    }

    return stripe.subscriptions.del(stripeSubscriptionId);
  }

  async function getSubscriptionCurrentPeriodEnd(subscriptionId) {
    if (stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      const fakeEndDate = new Date().getTime() + 100 * 365 * 24 * 60 * 60 * 1000;
      return Promise.resolve(fakeEndDate);
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    return subscription.current_period_end;
  }

  function verifyEvent(body, signature) {
    if (stripe === null) {
      logger.info('Stripe not enabled on this instance, resolving.');
      return Promise.resolve(body);
    }

    return stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_ENDPOINT_SECRET);
  }

  function createSession(locale) {
    return stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      subscription_data: {
        // default_tax_rates: [process.env.STRIPE_DEFAULT_TAX_RATE_ID],
        items: [
          {
            plan: process.env.STRIPE_MONTHLY_PLAN_ID,
          },
        ],
      },
      locale,
      success_url: `${process.env.GLADYS_WEBSITE_URL}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.GLADYS_WEBSITE_URL}/pricing`,
    });
  }

  async function createBillingPortalSession(stripeCustomerId) {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: process.env.GLADYS_PLUS_FRONTEND_URL,
    });

    return session.url;
  }

  function getCustomer(customerId) {
    return stripe.customers.retrieve(customerId);
  }

  function addTaxRate(subscriptionId) {
    return stripe.subscriptions.update(subscriptionId, {
      default_tax_rates: [process.env.STRIPE_DEFAULT_TAX_RATE_ID],
    });
  }

  async function updateCustomerFromMonthlyToYearly(subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
      proration_behavior: 'create_prorations',
      items: [
        {
          id: subscription.items.data[0].id,
          price: process.env.STRIPE_YEARLY_PLAN_ID,
        },
      ],
    });
  }

  return {
    subscribeToMonthlyPlan,
    cancelMonthlySubscription,
    createCustomer,
    getCard,
    getSubscriptionDefaultPaymentMethod,
    updateCard,
    verifyEvent,
    getSubscriptionCurrentPeriodEnd,
    getSubscription,
    createSession,
    getCustomer,
    addTaxRate,
    createBillingPortalSession,
    updateCustomerFromMonthlyToYearly,
  };
};
