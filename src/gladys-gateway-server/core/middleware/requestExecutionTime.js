const asyncMiddleware = require('./asyncMiddleware.js');

module.exports = function RequestExecutionTime(logger, analyticsService) {
  return asyncMiddleware(async (req, res, next) => {
    const start = Date.now();
    // The 'finish' event will emit once the response is done sending
    res.once('finish', () => {
      const elapsedMs = Date.now() - start;
      logger.debug(`Request execution time: ${elapsedMs} ms`);
      let userId = 'not-authenticated';
      if (req.user && req.user.id) {
        userId = req.user.id;
      }
      if (req.instance && req.instance.id) {
        userId = req.instance.id;
      }
      analyticsService.sendMetric('api-request', elapsedMs, userId);
    });
    next();
  });
};
