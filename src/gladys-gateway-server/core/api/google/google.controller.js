/* eslint-disable function-paren-newline */
/* eslint-disable implicit-arrow-linebreak */
/* eslint-disable arrow-parens */
const { BadRequestError } = require('../../common/error');

const VALID_REDIRECT_URIS = [
  'https://oauth-redirect.googleusercontent.com',
  'https://oauth-redirect-sandbox.googleusercontent.com',
];

module.exports = function GoogleController(logger, googleModel, socketModel, instanceModel, userModel) {
  /**
   * @api {post} /v1/api/google/smart_home Entrypoint for google smart home
   * @apiName Get data/control home
   * @apiGroup Google Home
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
  /**
   * @api {post} /v1/api/google/authorize Get authorization code
   * @apiName Get authorization code
   * @apiGroup Google Home
   */
  async function authorize(req, res) {
    const { GOOGLE_HOME_OAUTH_CLIENT_ID } = process.env;
    if (req.body.client_id !== GOOGLE_HOME_OAUTH_CLIENT_ID) {
      throw new BadRequestError('client_id is not matching');
    }
    const baseUrlFound = VALID_REDIRECT_URIS.find(
      (redirectUriBaseUrl) => req.body.redirect_uri && req.body.redirect_uri.startsWith(redirectUriBaseUrl),
    );
    if (!baseUrlFound) {
      throw new BadRequestError('invalid redirect_uri');
    }
    const code = await googleModel.getCode(req.user.id);
    const redirectUrl = `${req.body.redirect_uri}?state=${req.body.state}&code=${code}`;
    res.json({
      redirectUrl,
    });
  }
  /**
   * @api {post} /v1/api/google/token Get access token
   * @apiName Get access token
   * @apiGroup Google Home
   */
  async function token(req, res, next) {
    const { GOOGLE_HOME_OAUTH_CLIENT_ID, GOOGLE_HOME_OAUTH_CLIENT_SECRET } = process.env;
    try {
      if (req.body.client_id !== GOOGLE_HOME_OAUTH_CLIENT_ID) {
        throw new BadRequestError('client_id is not matching');
      }
      if (req.body.client_secret !== GOOGLE_HOME_OAUTH_CLIENT_SECRET) {
        throw new BadRequestError('client_secret is not matching');
      }
      if (req.body.grant_type === 'authorization_code') {
        const { accessToken, refreshToken } = await googleModel.getRefreshTokenAndAccessToken(req.body.code);
        res.json({
          token_type: 'Bearer',
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        });
      } else if (req.body.grant_type === 'refresh_token') {
        const { accessToken } = await googleModel.getAccessToken(req.body.refresh_token);
        res.json({
          token_type: 'Bearer',
          access_token: accessToken,
          expires_in: 3600,
        });
      } else {
        throw new BadRequestError('wrong grand_type');
      }
    } catch (e) {
      logger.error(e);
      res.status(400).json({ error: 'invalid_grant' });
    }
  }
  return {
    smartHome,
    authorize,
    token,
  };
};
