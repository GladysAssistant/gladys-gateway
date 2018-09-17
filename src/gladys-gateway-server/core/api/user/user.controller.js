module.exports = function(userModel) {

  async function signup(req, res, next) {
    var user = await userModel.signup(req.body);
    res.json(user);
  }

  return {
    signup
  };
};