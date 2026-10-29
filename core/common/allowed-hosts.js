/**
 * Parse the ALLOWED_HOSTS environment variable: a comma-separated list of host names.
 * @param {string} value - e.g. "api.gladysgateway.com, other.example.com".
 * @returns {Array<string>} The trimmed, lowercased, non-empty host names.
 */
function parseAllowedHosts(value) {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
}

/**
 * Normalize a Host header: lowercase, without the port and without one trailing dot.
 * A bracketed IPv6 host ([2001:db8::1]:443) keeps its brackets ([2001:db8::1]).
 * @param {string} hostHeader
 * @returns {string}
 */
function normalizeHost(hostHeader) {
  let host = hostHeader.trim().toLowerCase();
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    host = end === -1 ? host : host.slice(0, end + 1);
  } else {
    [host] = host.split(':');
  }
  return host.endsWith('.') ? host.slice(0, -1) : host;
}

/**
 * Is this Host header one of the allowed hosts?
 *
 * Give it the raw Host header (req.headers.host), never req.hostname: with
 * "trust proxy" set, Express reads req.hostname from X-Forwarded-Host, which
 * the load balancer does not overwrite, so a client could spoof it.
 * @param {string} hostHeader - The raw Host header, possibly missing.
 * @param {Array<string>} allowedHosts - From parseAllowedHosts. Empty: the filter is disabled.
 * @returns {boolean}
 */
function isAllowedHost(hostHeader, allowedHosts) {
  if (allowedHosts.length === 0) {
    return true;
  }
  if (typeof hostHeader !== 'string' || hostHeader.length === 0) {
    return false;
  }
  return allowedHosts.includes(normalizeHost(hostHeader));
}

/**
 * socket.io "allowRequest" option: socket.io answers /socket.io/ requests
 * before Express, so the allowed hosts middleware does not see them.
 * @param {Array<string>} allowedHosts
 * @returns {Function} (req, callback) => void
 */
function getSocketAllowRequest(allowedHosts) {
  return (req, callback) => {
    if (isAllowedHost(req.headers.host, allowedHosts)) {
      callback(null, true);
    } else {
      callback('Host not allowed', false);
    }
  };
}

module.exports = {
  parseAllowedHosts,
  normalizeHost,
  isAllowedHost,
  getSocketAllowRequest,
};
