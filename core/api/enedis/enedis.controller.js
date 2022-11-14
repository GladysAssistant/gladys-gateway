const get = require('get-value');
const Joi = require('joi');
const { ServerError, ForbiddenError, BadRequestError, ValidationError } = require('../../common/error');
const schema = require('../../common/schema');

module.exports = function EnedisController(logger, enedisModel) {
  const parseError = (e) => {
    if (e instanceof ForbiddenError) {
      return e;
    }
    if (get(e, 'response.status') === 403) {
      return new ForbiddenError();
    }
    if (get(e, 'response.status') === 400) {
      return new BadRequestError();
    }
    return new ServerError();
  };

  const validateEnedisQuery = (data) => {
    const { error, value } = Joi.validate(data, schema.enedisApiQuerySchema, {
      stripUnknown: true,
      abortEarly: false,
      presence: 'required',
    });

    if (error) {
      logger.debug(error);
      throw new ValidationError('Enedis', error);
    }

    return value;
  };

  /**
   * @api {get} /enedis/initialize Get redirect uri
   * @apiName Get redirect uri
   * @apiGroup Enedis
   */
  async function initialize(req, res) {
    const redirectUri = await enedisModel.getRedirectUri();
    return res.json({
      redirect_uri: redirectUri,
    });
  }

  /**
   * @api {post} /enedis/finalize Finalize Oauth 2.0 process
   * @apiName Finalize Oauth 2.0 process
   * @apiGroup Enedis
   */
  async function finalize(req, res) {
    logger.info(`Enedis.finalize`);
    try {
      const usagePoints = await enedisModel.handleAcceptGrantMessage(req.body.code, req.user);
      res.json(usagePoints);
    } catch (e) {
      logger.error(`ENEDIS_FINALIZE_ERROR, user_id = ${req.user.id}`);
      logger.error(e);
      throw parseError(e);
    }
  }

  /**
   * @api {get} /enedis/api/v4/metering_data/consumption_load_curve Consumption load curve
   * @apiName Consumption load curve
   * @apiGroup Enedis
   */
  async function meteringDataConsumptionLoadCurve(req, res) {
    logger.info(`Enedis.meteringDataConsumptionLoadCurve`);
    const url = '/v4/metering_data/consumption_load_curve';
    const data = validateEnedisQuery(req.query);
    try {
      const accessToken = await enedisModel.getAccessToken(req.instance.id);
      const response = await enedisModel.makeRequestWithQueueAndRetry(url, data, accessToken);
      res.json(response);
    } catch (e) {
      logger.error('ENEDIS_API_CALL_ERROR');
      logger.error(req.query);
      logger.error(e);

      throw parseError(e);
    }
  }

  /**
   * @api {get} /enedis/api/v4/metering_data/daily_consumption_max_power Daily consumption max power
   * @apiName Daily consumption max power
   * @apiGroup Enedis
   */
  async function meteringDataDailyConsumptionMaxPower(req, res) {
    logger.info(`Enedis.meteringDataDailyConsumptionMaxPower`);
    const url = '/v4/metering_data/daily_consumption_max_power';
    const data = validateEnedisQuery(req.query);
    try {
      const accessToken = await enedisModel.getAccessToken(req.instance.id);
      const response = await enedisModel.makeRequestWithQueueAndRetry(url, data, accessToken);
      res.json(response);
    } catch (e) {
      logger.error('ENEDIS_API_CALL_ERROR');
      logger.error(req.query);
      logger.error(e);
      throw parseError(e);
    }
  }

  /**
   * @api {get} /enedis/api/v4/metering_data/daily_consumption Daily consumption
   * @apiName Daily consumption
   * @apiGroup Enedis
   */
  async function meteringDataDailyConsumption(req, res) {
    logger.info(`Enedis.meteringDataDailyConsumption`);
    const url = '/v4/metering_data/daily_consumption';
    const data = validateEnedisQuery(req.query);
    try {
      const accessToken = await enedisModel.getAccessToken(req.instance.id);
      const response = await enedisModel.makeRequestWithQueueAndRetry(url, data, accessToken);
      res.json(response);
    } catch (e) {
      logger.error('ENEDIS_API_CALL_ERROR');
      logger.error(req.query);
      logger.error(e);
      throw parseError(e);
    }
  }

  return {
    finalize,
    meteringDataConsumptionLoadCurve,
    meteringDataDailyConsumptionMaxPower,
    meteringDataDailyConsumption,
    initialize,
  };
};
