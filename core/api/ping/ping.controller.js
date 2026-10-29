const NOT_DRAINING = { isDraining: () => false };

module.exports = function PingController(pingModel, lifecycle = NOT_DRAINING) {
  /**
   * @api {get} /ping Return server status
   * @apiName ping
   * @apiGroup Ping
   * @apiDescription Checks the database and Redis connections. Answers 503 while the
   * server is shutting down, so that a proxy or a load balancer checking this route
   * stops sending traffic to this node before it closes its connections.
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  async function ping(req, res, next) {
    if (lifecycle.isDraining()) {
      return res.status(503).json({ status: 503, draining: true });
    }
    await pingModel.ping();
    return res.json({ status: 200 });
  }

  return {
    ping,
  };
};
