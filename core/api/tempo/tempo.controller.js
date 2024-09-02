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

  return {
    getTempoToday,
  };
};
