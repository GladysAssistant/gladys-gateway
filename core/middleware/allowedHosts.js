const { isAllowedHost } = require('../common/allowed-hosts');

/**
 * Reject the requests whose Host header is not one of the allowed hosts.
 *
 * The load balancer forwards every request reaching its IP, whatever the Host,
 * so internet scanners reach the API with random domains.
 * @param {object} logger
 * @param {Array<string>} allowedHosts - From parseAllowedHosts. Empty: the filter is disabled.
 */
module.exports = function AllowedHostsMiddleware(logger, allowedHosts) {
  return function allowedHostsMiddleware(req, res, next) {
    // Always let /ping through, whatever the Host: the load balancer health check
    // calls it with the IP of the server as Host. Rejecting it would mark the
    // server unhealthy and take the whole API down.
    if (req.path === '/ping' || isAllowedHost(req.headers.host, allowedHosts)) {
      next();
      return;
    }
    // Scanner noise: no error (nothing reaches the error middleware nor Sentry), debug log only
    logger.debug(`Rejected request with a disallowed Host: ${req.headers.host}`);
    res.status(421).end();
  };
};
