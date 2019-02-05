module.exports = function PingController(pingModel) {
  /**
   * @api {get} /ping Return server status
   * @apiName ping
   * @apiGroup Ping
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  async function ping(req, res, next) {
    await pingModel.ping();
    return res.json({ status: 200 });
  }

  return {
    ping,
  };
};
