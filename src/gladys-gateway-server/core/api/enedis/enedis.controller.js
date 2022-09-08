const get = require('get-value');
const { ServerError, ForbiddenError } = require('../../common/error');

module.exports = function EnedisController(logger, enedisModel, errorService) {
  const parseError = (e) => {
    if (e instanceof ForbiddenError) {
      return e;
    }
    if (get(e, 'response.status') === 403) {
      return new ForbiddenError();
    }
    return new ServerError();
  };
  /**
   * @api {post} /enedis/finalize Finalize Oauth 2.0 process
   * @apiName Finalize Oauth 2.0 process
   * @apiGroup Enedis
   */
  async function finalize(req, res) {
    logger.info(`Enedis.finalize}`);
    try {
      const usagePoints = await enedisModel.handleAcceptGrantMessage(req.body.code, req.user);
      res.json(usagePoints);
    } catch (e) {
      errorService.track('ENEDIS_FINALIZE_ERROR', {
        error: e,
        payload: req.body,
        user: req.user.id,
      });
      throw parseError(e);
    }
  }

  /**
   * @api {get} /enedis/api/v4/metering_data/consumption_load_curve Consumption load curve
   * @apiName Consumption load curve
   * @apiGroup Enedis
   */
  async function meteringDataConsumptionLoadCurve(req, res) {
    logger.info(`Enedis.meteringDataConsumptionLoadCurve}`);
    const url = '/v4/metering_data/consumption_load_curve';
    try {
      const accessToken = await enedisModel.getAccessToken(req.instance.id);
      const response = await enedisModel.makeRequestWithQueueAndRetry(url, req.query, accessToken);
      res.json(response);
    } catch (e) {
      logger.debug(e);
      errorService.track('ENEDIS_API_CALL_ERROR', {
        error: e,
        url,
        payload: req.query,
        instance: req.instance.id,
      });
      throw parseError(e);
    }
  }

  /**
   * @api {get} /enedis/api/v4/metering_data/daily_consumption_max_power Daily consumption max power
   * @apiName Daily consumption max power
   * @apiGroup Enedis
   */
  async function meteringDataDailyConsumptionMaxPower(req, res) {
    logger.info(`Enedis.meteringDataDailyConsumptionMaxPower}`);
    const url = '/v4/metering_data/daily_consumption_max_power';
    try {
      const accessToken = await enedisModel.getAccessToken(req.instance.id);
      const response = await enedisModel.makeRequestWithQueueAndRetry(url, req.query, accessToken);
      res.json(response);
    } catch (e) {
      logger.debug(e);
      errorService.track('ENEDIS_API_CALL_ERROR', {
        error: e,
        url,
        payload: req.body,
        instance: req.instance.id,
      });
      throw parseError(e);
    }
  }

  /**
   * @api {get} /enedis/api/v4/metering_data/daily_consumption Daily consumption
   * @apiName Daily consumption
   * @apiGroup Enedis
   */
  async function meteringDataDailyConsumption(req, res) {
    logger.info(`Enedis.meteringDataDailyConsumption}`);
    const url = '/v4/metering_data/daily_consumption';
    try {
      const accessToken = await enedisModel.getAccessToken(req.instance.id);
      const response = await enedisModel.makeRequestWithQueueAndRetry(url, req.query, accessToken);
      res.json(response);
    } catch (e) {
      logger.debug(e);
      errorService.track('ENEDIS_API_CALL_ERROR', {
        error: e,
        url,
        payload: req.body,
        instance: req.instance.id,
      });
      throw parseError(e);
    }
  }

  return {
    finalize,
    meteringDataConsumptionLoadCurve,
    meteringDataDailyConsumptionMaxPower,
    meteringDataDailyConsumption,
  };
};
