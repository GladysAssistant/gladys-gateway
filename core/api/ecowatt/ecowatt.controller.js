module.exports = function EcowattController(logger, ecowattModel) {
  /**
   * @api {get} /ecowatt/v4/signals Get ecowatt signals
   * @apiName Get ecowatt signals
   * @apiGroup Ecowatt
   */
  async function getEcowattSignals(req, res) {
    logger.info(`Ecowatt.getEcowattSignals`);
    const response = await ecowattModel.getDataWithRetry();
    const cachePeriodInSecond = 60 * 60;
    res.set('Cache-control', `public, max-age=${cachePeriodInSecond}`);
    res.json(response);
  }

  return {
    getEcowattSignals,
  };
};
