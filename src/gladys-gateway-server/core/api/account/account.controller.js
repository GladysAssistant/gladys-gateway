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

  return {
    getUsers
  };
};