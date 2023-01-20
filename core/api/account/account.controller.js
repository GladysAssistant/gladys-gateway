const geoip = require('geoip-lite');

module.exports = function AccountController(accountModel, socketModel) {
  /**
   * @api {get} /accounts/users Get users
   * @apiName Get Users
   * @apiGroup Account
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * [{
   *   "id": "86579179-a40b-44e9-9c22-2166b5de3805",
   *   "name": "Tony",
   *   "email": "tony.stark@gladysassistant.com"
   * }]
   */
  async function getUsers(req, res, next) {
    const users = await accountModel.getUsers(req.user);
    res.json(users);
  }

  /**
   * @api {post} /accounts/subscribe Subscribe plan
   * @apiName Subcribe plan
   * @apiGroup Account
   *
   * @apiParam {String} stripe_source_id Stripe source id
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "current_period_end": 1537841579580,
   * }
   */
  async function subscribeMonthlyPlan(req, res, next) {
    const account = await accountModel.subscribeMonthlyPlan(req.user, req.body.stripe_source_id);
    res.json({
      current_period_end: account.current_period_end,
    });
  }

  /**
   * @api {post} /accounts/subscribe/new New account with plan
   * @apiName New account with plan
   * @apiGroup Account
   *
   * @apiParam {String} email email
   * @apiParam {String} language Language
   * @apiParam {String} stripe_source_id Stripe source id
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "current_period_end": 1537841579580,
   * }
   */
  async function subscribeMonthlyPlanWithoutAccount(req, res, next) {
    const account = await accountModel.subscribeMonthlyPlanWithoutAccount(req.body.email, req.body.language);
    res.json({
      current_period_end: account.current_period_end,
    });
  }

  /**
   * @api {post} /stripe/webhook Stripe Webhook
   * @apiName Stripe Webhook
   * @apiGroup Stripe
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "success": true
   * }
   */
  async function stripeEvent(req, res, next) {
    await accountModel.stripeEvent(req.body, req.headers['stripe-signature']);
    res.json({ success: true });
  }

  /**
   * @api {patch} /accounts/source Update card
   * @apiName Update card
   * @apiGroup Account
   *
   * @apiParam {String} stripe_source_id Stripe source id
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "success": true
   * }
   */
  async function updateCard(req, res, next) {
    await accountModel.updateCard(req.user, req.body.stripe_source_id);
    res.json({ success: true });
  }

  /**
   * @api {get} /accounts/source Get card
   * @apiName Get card
   * @apiGroup Account
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "brand": "VISA",
   *   "country": "US",
   *   "exp_month": 10,
   *   "exp_year": 2020,
   *   "last4": 4242
   * }
   */
  async function getCard(req, res, next) {
    const card = await accountModel.getCard(req.user);
    res.json(card);
  }

  /**
   * @api {post} /accounts/cancel Cancel plan
   * @apiName Cancel plan
   * @apiGroup Account
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "success": true
   * }
   */
  async function cancelMonthlySubscription(req, res, next) {
    await accountModel.cancelMonthlySubscription(req.user);
    res.json({ success: true });
  }

  /**
   * @api {post} /accounts/upgrade-to-yearly Upgrade to yearly
   * @apiName Upgrade plan to yearly
   * @apiGroup Account
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "success": true
   * }
   */
  async function upgradeFromMonthlyToYearly(req, res, next) {
    await accountModel.upgradeFromMonthlyToYearly(req.user);
    res.json({ success: true });
  }

  /**
   * @api {get} /accounts/plan Get current plan
   * @apiName Get current plan
   * @apiGroup Account
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "plan": "yearly"
   * }
   */
  async function getUserCurrentPlan(req, res, next) {
    const accountPlan = await accountModel.getUserCurrentPlan(req.user);
    res.json(accountPlan);
  }

  /**
   * @api {post} /accounts/resubscribe Resubscribe to plan
   * @apiName Resubscribe plan
   * @apiGroup Account
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "current_period_end": 1537841579580,
   * }
   */
  async function subscribeAgainToMonthlySubscription(req, res, next) {
    const account = await accountModel.subscribeAgainToMonthlySubscription(req.user);
    res.json({
      current_period_end: account.current_period_end,
    });
  }

  /**
   * @api {post} /accounts/users/:id/revoke Revoke user
   * @apiName Revoke user
   * @apiGroup Account
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "success": true
   * }
   */
  async function revokeUser(req, res, next) {
    await accountModel.revokeUser(req.user, req.params.id);
    await socketModel.disconnectUser(req.params.id);
    res.json({ success: true });
  }

  /**
   * @api {get} /accounts/invoices Get Invoices
   * @apiName Get invoices
   * @apiGroup Account
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * [{
   *   "id": "69b39956-77e7-4b4d-b0ae-259ea7e017a2",
   *   "hosted_invoice_url": "",
   *   "invoice_pdf": "",
   *   "amount_paid": 999
   *   "created_at": ""
   * }]
   */
  async function getInvoices(req, res, next) {
    const invoices = await accountModel.getInvoices(req.user);
    res.json(invoices);
  }

  /**
   * @api {post} /accounts/payments/sessions Create new payment session
   * @apiName Create new payment session
   * @apiGroup Account
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "id": "unique-id"
   * }
   */
  async function createPaymentSession(req, res, next) {
    const session = await accountModel.createPaymentSession(req.body.locale || 'en');
    res.json(session);
  }

  /**
   * @api {get} /accounts/stripe_customer_portal/:stripe_portal_key Redirect to stripe customer portal
   * @apiName Redirect to stripe customer portal
   * @apiGroup Account
   *
   *
   * @apiSuccessExample {text} Success-Response:
   * HTTP/1.1 302 REDIRECT
   */
  async function redirectToStripeCustomerPortal(req, res, next) {
    const geo = geoip.lookup(req.ip);
    const url = await accountModel.createBillingPortalSession(req.params.stripe_portal_key, geo);
    res.redirect(url);
  }

  return {
    getUsers,
    subscribeMonthlyPlan,
    subscribeAgainToMonthlySubscription,
    subscribeMonthlyPlanWithoutAccount,
    updateCard,
    revokeUser,
    getCard,
    cancelMonthlySubscription,
    stripeEvent,
    getInvoices,
    createPaymentSession,
    redirectToStripeCustomerPortal,
    upgradeFromMonthlyToYearly,
    getUserCurrentPlan,
  };
};
