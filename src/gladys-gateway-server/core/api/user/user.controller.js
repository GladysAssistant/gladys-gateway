module.exports = function(userModel, mailgunService) {

  async function signup(req, res, next) {
    var user = await userModel.signup(req.body);
    
    // send confirmation email to user
    mailgunService.send(user, 'confirmation', {
      confirmationUrl: process.env.GLADYS_GATEWAY_FRONTEND_URL + '/confirm-email/' + user.email_confirmation_token
    });
    
    res.json(user);
  }

  return {
    signup
  };
};