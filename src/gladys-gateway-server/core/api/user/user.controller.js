module.exports = function(userModel, mailgunService) {

  async function signup(req, res, next) {
    var user = await userModel.signup(req.body);
    
    // send confirmation email to user
    mailgunService.send(user, 'confirmation', {
      confirmationUrl: process.env.GLADYS_GATEWAY_FRONTEND_URL + '/confirm-email/' + user.email_confirmation_token
    });

    res.status(201).json({
      status: 201,
      message: 'User created with success. You need now to confirm your email.'
    });
  }
  
  async function confirmEmail(req, res, next){
    var user = await userModel.confirmEmail(req.body.email_confirmation_token);
    res.json(user);
  }

  async function loginGetSalt(req, res, next){
    var user = await userModel.loginGetSalt(req.body);
    res.json(user);
  }

  async function loginGenerateEphemeralValuePair(req, res, next) {
    res.json(await userModel.loginGenerateEphemeralValuePair(req.body));
  }

  async function loginDeriveSession(req, res, next) {
    res.json(await userModel.loginDeriveSession(req.body));
  }

  async function configureTwoFactor(req, res, next){
    var secret = await userModel.configureTwoFactor(req.user);
    res.json(secret);
  }

  async function enableTwoFactor(req, res, next) {
    res.json(await userModel.enableTwoFactor(req.user, req.body.two_factor_code));
  }

  async function loginTwoFactor(req, res, next){
    var tokens = await userModel.loginTwoFactor(req.user, req.body.two_factor_code, req.body.device_name, req.headers['user-agent']);
    res.json(tokens);
  }

  return {
    signup,
    confirmEmail,
    configureTwoFactor,
    enableTwoFactor,
    loginGetSalt,
    loginGenerateEphemeralValuePair,
    loginDeriveSession,
    loginTwoFactor
  };
};