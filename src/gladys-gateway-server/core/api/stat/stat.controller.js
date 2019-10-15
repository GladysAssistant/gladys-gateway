module.exports = function StatController(statModel) {
  /**
   * @api {get} /stats Get open stats
   * @apiName Get open stats
   * @apiGroup Stats
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   gladys_4_instances: [{
   *     "nb_instances": 200,
   *     "month": "2019-09"
   *   }]
   * }
   */
  async function getStats(req, res, next) {
    const gladys4Instances = await statModel.getNumberOfGladys4Instances();
    res.json({
      gladys_4_instances: gladys4Instances,
    });
  }

  return {
    getStats,
  };
};
