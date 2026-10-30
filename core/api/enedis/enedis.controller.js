const get = require('get-value');

const { ServerError, ForbiddenError, ValidationError, BadRequestError } = require('../../common/error');
const schema = require('../../common/schema');

module.exports = function EnedisController(logger, enedisModel) {
  const parseError = (e) => {
    if (get(e, 'response.status') === 403) {
      return new ForbiddenError();
    }
    return new ServerError();
  };

  const validateEnedisQuery = (data) => {
    const { error, value } = schema.enedisApiQuerySchema.validate(data, {
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
   *
   * @apiParam {String} autorisation_id The autorisation_id of the redirect URL of the Enedis consent
   */
  async function finalize(req, res) {
    logger.info(`Enedis.finalize`);
    // DataConnect 2026 flow: the redirect URL contains an autorisation_id, exchanged with
    // Enedis for the usage points ids (PRM) the customer consented to. The usage points ids
    // are never taken from the client: the legacy flow did, so any account could link (and
    // read the consumption of) any meter.
    const { autorisation_id: autorisationId } = req.body;
    if (typeof autorisationId !== 'string' || autorisationId.length === 0) {
      throw new BadRequestError('autorisation_id is required');
    }
    try {
      const usagePoints = await enedisModel.handleAcceptAuthorization(autorisationId, req.user);
      res.json(usagePoints);
    } catch (e) {
      // Never log the error object itself here: an axios error carries the request body
      // in config.data, which would put the authorization id in the logs.
      const status = get(e, 'response.status');
      logger.error(`ENEDIS_FINALIZE_ERROR, user_id = ${req.user.id}, status = ${status || 'none'}, ${e.message}`);
      if (!status) {
        logger.error(e.stack);
      }
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
