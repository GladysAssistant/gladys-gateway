const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * Number of proxies in front of the gateway whose X-Forwarded-For entries are trusted
 * (Express "trust proxy" setting): 1 with the DigitalOcean load balancer alone, 2 with
 * the nginx of deploy/docker-compose.yml behind it. Never 0: without a trusted hop,
 * req.ip would be the address of the proxy and the rate limiters would throttle everyone.
 */
module.exports = function parseTrustedProxyHops(value) {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_TRUSTED_PROXY_HOPS;
  }
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error(`Invalid TRUSTED_PROXY_HOPS: "${value}" (an integer greater than or equal to 1 is expected)`);
  }
  return hops;
};
