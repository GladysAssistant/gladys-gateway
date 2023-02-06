const get = require('get-value');
const Joi = require('joi');

const { ServerError, ForbiddenError, ValidationError } = require('../../common/error');
const schema = require('../../common/schema');

module.exports = function EnedisController(logger, enedisModel) {
  const parseError = (e) => {
    if (get(e, 'response.status') === 403) {
      return new ForbiddenError();
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
      const usagePoints = await enedisModel.handleAcceptGrantMessage(req.body.code, req.user, req.body.usage_points_id);
      res.json(usagePoints);
    } catch (e) {
      logger.error(`ENEDIS_FINALIZE_ERROR, user_id = ${req.user.id}`);
      logger.error(e);
      throw parseError(e);
    }
  }

  /**
   * @api {get} /enedis/metering_data/daily_consumption Daily consumption
   * @apiName Daily consumption
   * @apiGroup Enedis
   */
  async function meteringDataDailyConsumption(req, res) {
    const queryParams = validateEnedisQuery(req.query);
    const response = await enedisModel.getDailyConsumption(
      req.instance.id,
      queryParams.usage_point_id,
      queryParams.take,
      queryParams.after,
    );
    res.json(response);
  }

  /**
   * @api {get} /enedis/metering_data/consumption_load_curve Consumption load curve
   * @apiName Consumption load curve
   * @apiGroup Enedis
   */
  async function meteringDataConsumptionLoadCurve(req, res) {
    const queryParams = validateEnedisQuery(req.query);
    const response = await enedisModel.getConsumptionLoadCurve(
      req.instance.id,
      queryParams.usage_point_id,
      queryParams.take,
      queryParams.after,
    );
    res.json(response);
  }

  /**
   * @api {get} /enedis/sync Get user sync
   * @apiName Get user sync
   * @apiGroup Enedis
   */
  async function getEnedisSync(req, res) {
    const syncs = await enedisModel.getEnedisSync(req.user.id, req.query.take);
    res.json(syncs);
  }

  /**
   * @api {post} /enedis/refresh_all Refresh all data
   * @apiName Refresh all data
   * @apiGroup Enedis
   */
  async function refreshAllData(req, res) {
    await enedisModel.refreshAlldata(req.user.id);
    res.json({ success: true });
  }

  /**
   * @api {post} /admin/api/enedis/daily_refresh Daily refresh for all users
   * @apiName Daily refresh for all users
   * @apiGroup Enedis
   */
  async function dailyRefreshForAllUsers(req, res) {
    await enedisModel.dailyRefreshForAllUsers();
    res.json({ success: true });
  }

  return {
    finalize,
    meteringDataConsumptionLoadCurve,
    meteringDataDailyConsumption,
    initialize,
    refreshAllData,
    dailyRefreshForAllUsers,
    getEnedisSync,
  };
};
