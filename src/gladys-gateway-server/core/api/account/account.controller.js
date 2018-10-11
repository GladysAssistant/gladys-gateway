module.exports = function(accountModel) {

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
   *   "email": "tony.stark@gladysproject.com"
   * }]
   */
  async function getUsers(req, res, next) {
    var users = await accountModel.getUsers(req.user);
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
    var account = await accountModel.subscribeMonthlyPlan(req.user, req.body.stripe_source_id);
    res.json({ current_period_end: account.current_period_end });
  }

  return {
    getUsers,
    subscribeMonthlyPlan
  };
};