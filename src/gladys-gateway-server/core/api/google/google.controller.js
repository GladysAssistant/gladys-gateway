/* eslint-disable function-paren-newline */
/* eslint-disable implicit-arrow-linebreak */
/* eslint-disable arrow-parens */
const get = require('get-value');
const { BadRequestError } = require('../../common/error');

const VALID_REDIRECT_URIS = [
  'https://oauth-redirect.googleusercontent.com',
  'https://oauth-redirect-sandbox.googleusercontent.com',
];

module.exports = function GoogleController(
  logger,
  googleModel,
  socketModel,
  instanceModel,
  userModel,
  deviceModel,
  instrumentalAgentService,
) {
  /**
   * @api {post} /v1/api/google/smart_home Entrypoint for google smart home
   * @apiName Get data/control home
   * @apiGroup Google Home
   */
  async function smartHome(req, res) {
    instrumentalAgentService.increment('backend.requests.google-home.smart-home');
    const user = await userModel.getMySelf({ id: req.user.id });
    const primaryInstance = await instanceModel.getPrimaryInstanceByAccount(user.account_id);
    const firstOrderIntent = get(req.body, 'inputs.0.intent');
    const message = {
      version: '1.0',
      type: 'gladys-open-api',
      action: 'google-home-request',
      instance_id: primaryInstance.id,
      data: req.body,
    };
    // try to revoke device if exist
    if (firstOrderIntent === 'action.devices.DISCONNECT' && req.device && req.device.id) {
      try {
        logger.info(`Google Home: Receiving unlink request, revoking Google Home session for device ${req.device.id}`);
        await deviceModel.revokeDevice(req.user, req.device.id);
      } catch (e) {
        logger.warn(e);
      }
    }
    // then, we sent the request to the local Gladys instance
    const response = await socketModel.sendMessageOpenApi(user, message);
    if (response.status && response.status >= 400) {
      res.status(response.status);
    }
    // override agentUserId, it's the account id
    // and it shouldn't be sent by the client for security purposes.
    if (response.payload && response.payload.agentUserId) {
      response.payload.agentUserId = user.account_id;
    }
    return res.json(response);
  }
  /**
   * @api {post} /google/authorize Get authorization code
   * @apiName Get authorization code
   * @apiGroup Google Home
   */
  async function authorize(req, res) {
    instrumentalAgentService.increment('backend.requests.google-home.authorize');
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
    instrumentalAgentService.increment('backend.requests.google-home.token');
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
  /**
   * @api {post} /google/request_sync Request Sync
   * @apiName Request Sync
   * @apiGroup Google Home
   */
  async function requestSync(req, res) {
    instrumentalAgentService.increment('backend.requests.google-home.request-sync');
    await googleModel.requestSync(req.instance.id);
    res.json({
      status: 200,
    });
  }
  /**
   * @api {post} /google/report_state Report State
   * @apiName Report State
   * @apiGroup Google Home
   */
  async function reportState(req, res) {
    instrumentalAgentService.increment('backend.requests.google-home.report-state');
    await googleModel.reportState(req.instance.id, req.body);
    res.json({
      status: 200,
    });
  }
  return {
    smartHome,
    authorize,
    token,
    requestSync,
    reportState,
  };
};
