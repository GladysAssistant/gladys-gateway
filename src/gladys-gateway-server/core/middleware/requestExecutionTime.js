const asyncMiddleware = require('./asyncMiddleware.js');

module.exports = function RequestExecutionTime(logger, instrumentalAgentService) {
  return asyncMiddleware(async (req, res, next) => {
    const start = Date.now();
    // The 'finish' event will emit once the response is done sending
    res.once('finish', () => {
      const elapsedMs = Date.now() - start;
      logger.debug(`Request execution time: ${elapsedMs} ms`);
      instrumentalAgentService.sendMetric('backend.requests.all.execution-time', elapsedMs);
    });
    next();
  });
};
