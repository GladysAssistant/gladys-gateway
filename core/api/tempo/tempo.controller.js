module.exports = function EcowattController(logger, tempoModel) {
  /**
   * @api {get} /edf/tempo/today Get tempo data today
   * @apiName Get tempo data
   * @apiGroup Tempo
   */
  async function getTempoToday(req, res) {
    logger.info(`Tempo.getDataToday`);
    const response = await tempoModel.getDataWithRetry();
    const cachePeriodInSecond = 60 * 60;
    res.set('Cache-control', `public, max-age=${cachePeriodInSecond}`);
    res.json(response);
  }

  /**
   * @api {get} /edf/tempo/historical Get tempo historical data
   * @apiName Get tempo historical data
   * @apiParam {String} start_date Start date
   * @apiParam {Number} take Number of days to retrieve
   * @apiGroup Tempo
   */
  async function getTempoHistoricalData(req, res) {
    logger.info(`Tempo.getHistoricalData`);
    const response = await tempoModel.getHistoricalData(req.query);
    const cachePeriodInSecond = 60 * 60;
    res.set('Cache-control', `public, max-age=${cachePeriodInSecond}`);
    res.json(response);
  }

  return {
    getTempoToday,
    getTempoHistoricalData,
  };
};
