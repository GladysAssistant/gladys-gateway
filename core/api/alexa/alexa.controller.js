/* eslint-disable function-paren-newline */
/* eslint-disable implicit-arrow-linebreak */
/* eslint-disable arrow-parens */
const get = require('get-value');
const clone = require('clone');
const { BadRequestError } = require('../../common/error');

const VALID_REDIRECT_URIS = [
  'https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUV',
  'https://layla.amazon.com/api/skill/link/M1CD0NOTQVDMUV',
  'https://alexa.amazon.co.jp/api/skill/link/M1CD0NOTQVDMUV',
];

module.exports = function AlexaController(
  logger,
  alexaModel,
  socketModel,
  instanceModel,
  userModel,
  deviceModel,
  analyticsService,
) {
  /**
   * @api {post} /v1/api/alexa/smart_home Entrypoint for alexa smart home
   * @apiName Get data/control home
   * @apiGroup Alexa
   */
  async function smartHome(req, res) {
    logger.debug(`Alexa : smartHome request`);
    logger.debug(req.body);
    analyticsService.sendMetric('alexa.smart-home', 1, req.user.id);
    const user = await userModel.getMySelf({ id: req.user.id });
    const directiveNamespace = get(req.body, 'directive.header.namespace');
    const directiveName = get(req.body, 'directive.header.name');
    const primaryInstance = await instanceModel.getPrimaryInstanceByAccount(user.account_id);

    try {
      // if the request is an accept grant request
      if (directiveNamespace === 'Alexa.Authorization' && directiveName === 'AcceptGrant') {
        const code = get(req.body, 'directive.payload.grant.code');
        const response = await alexaModel.handleAcceptGrantMessage(code, req.device.id);
        return res.json(response);
      }

      const bodyCloned = clone(req.body);

      // Remove scope that contains Gladys gateway credentials
      const endPointScope = get(bodyCloned, 'directive.endpoint.scope');
      if (endPointScope) {
        delete bodyCloned.directive.endpoint.scope;
      }

      // Remove useless cookie
      const cookie = get(bodyCloned, 'directive.endpoint.cookie');
      if (cookie) {
        delete bodyCloned.directive.endpoint.cookie;
      }

      // else, we sent the message to the local instance
      const message = {
        version: '1.0',
        type: 'gladys-open-api',
        action: 'alexa-request',
        instance_id: primaryInstance.id,
        data: bodyCloned,
      };

      // then, we sent the request to the local Gladys instance
      const response = await socketModel.sendMessageOpenApi(user, message);
      return res.json(response);
    } catch (e) {
      logger.error(`ALEXA_SMART_HOME_ERROR, user_id = ${user.id}`);
      logger.error(req.body);
      logger.error(e);

      throw e;
    }
  }
  /**
   * @api {post} /alexa/authorize Get authorization code
   * @apiName Get authorization code
   * @apiGroup Alexa
   */
  async function authorize(req, res) {
    logger.info(`Alexa.authorize : ${req.body.client_id}`);
    analyticsService.sendMetric('alexa.authorize', 1, req.body.client_id);
    const { ALEXA_OAUTH_CLIENT_ID } = process.env;
    if (req.body.client_id !== ALEXA_OAUTH_CLIENT_ID) {
      throw new BadRequestError('client_id is not matching');
    }
    const baseUrlFound = VALID_REDIRECT_URIS.find(
      (redirectUriBaseUrl) => req.body.redirect_uri && req.body.redirect_uri.startsWith(redirectUriBaseUrl),
    );
    if (!baseUrlFound) {
      throw new BadRequestError('invalid redirect_uri');
    }
    const code = await alexaModel.getCode(req.user.id);
    const redirectUrl = `${req.body.redirect_uri}?state=${req.body.state}&code=${code}`;
    res.json({
      redirectUrl,
    });
  }
  /**
   * @api {post} /v1/api/alexa/token Get access token
   * @apiName Get access token
   * @apiGroup Alexa
   */
  async function token(req, res, next) {
    logger.info(`Alexa.token : ${req.body.client_id} - ${req.body.grant_type}`);
    analyticsService.sendMetric('alexa.token', 1, req.body.client_id);
    const { ALEXA_OAUTH_CLIENT_ID, ALEXA_OAUTH_CLIENT_SECRET } = process.env;
    try {
      if (req.body.client_id !== ALEXA_OAUTH_CLIENT_ID) {
        throw new BadRequestError('client_id is not matching');
      }
      if (req.body.client_secret !== ALEXA_OAUTH_CLIENT_SECRET) {
        throw new BadRequestError('client_secret is not matching');
      }
      if (req.body.grant_type === 'authorization_code') {
        const { accessToken, refreshToken } = await alexaModel.getRefreshTokenAndAccessToken(req.body.code);
        res.json({
          token_type: 'Bearer',
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        });
      } else if (req.body.grant_type === 'refresh_token') {
        const { accessToken } = await alexaModel.getAccessToken(req.body.refresh_token);
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
   * @api {post} /alexa/report_state Report State
   * @apiName Report State
   * @apiGroup Alexa
   */
  async function reportState(req, res) {
    analyticsService.sendMetric('alexa.report-state', 1, req.instance.id);
    await alexaModel.reportState(req.instance.id, req.body);
    res.json({
      status: 200,
    });
  }
  return {
    smartHome,
    authorize,
    token,
    reportState,
  };
};
