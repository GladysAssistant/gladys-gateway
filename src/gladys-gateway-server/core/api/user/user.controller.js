module.exports = function(userModel, mailgunService) {

  async function signup(req, res, next) {
    var user = await userModel.signup(req.body);
    
    // send confirmation email to user
    mailgunService.send(user, 'confirmation', {
      confirmationUrl: process.env.GLADYS_GATEWAY_FRONTEND_URL + '/confirm-email/' + user.email_confirmation_token
    });

    res.json(user);
  }
  
  async function confirmEmail(req, res, next){
    var user = await userModel.confirmEmail(req.body.email_confirmation_token);
    res.json(user);
  }

  async function login(req, res, next) {
    var result = await userModel.login(req.body);
    res.json(result);
  }

  async function configureTwoFactor(req, res, next){
    var secret = await userModel.configureTwoFactor(req.user);
    res.json(secret);
  }

  return {
    signup,
    confirmEmail,
    configureTwoFactor,
    login
  };
};