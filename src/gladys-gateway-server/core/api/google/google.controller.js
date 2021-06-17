const { NotFoundError } = require('../../common/error');

module.exports = function GoogleController(googleModel, socketModel, instanceModel, userModel) {
  /**
   * @api {post} /v1/api/google/smart_home Entrypoint for google smart home
   * @apiName Google Home
   * @apiGroup Device
   */
  async function smartHome(req, res, next) {
    const user = await userModel.getMySelf({ id: req.user.id });
    const primaryInstance = await instanceModel.getPrimaryInstanceByAccount(user.account_id);
    const message = {
      version: '1.0',
      type: 'gladys-open-api',
      action: 'google-home-request',
      instance_id: primaryInstance.id,
      data: req.body,
    };
    const response = await socketModel.sendMessageOpenApi(req.user, message);
    if (response.status && response.status >= 400) {
      res.status(response.status);
    }
    return res.json(response);
  }
  async function connect(req, res, next) {
    req.user = {
      id: '29770e0d-26a9-444e-91a1-f175c99a5218',
    };
    const code = await googleModel.getCode(req.user.id);
    res.redirect(`${req.query.redirect_uri}?state=${req.query.state}&code=${code}`);
  }
  async function token(req, res, next) {
    console.log(req.body);
    console.log(req.query);
    if (req.body.code) {
      const { accessToken, refreshToken } = await googleModel.getRefreshTokenAndAccessToken(req.body.code);
      res.json({
        token_type: 'Bearer',
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
      });
    } else if (req.body.refresh_token) {
      const jwtToken = req.body.refresh_token.substr(7);
      const { accessToken } = await googleModel.getAccessToken(jwtToken);
      res.json({
        token_type: 'Bearer',
        access_token: accessToken,
        expires_in: 3600,
      });
    } else {
      throw new NotFoundError();
    }
  }
  return {
    smartHome,
    connect,
    token,
  };
};
