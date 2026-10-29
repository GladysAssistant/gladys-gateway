const net = require('net');

/**
 * Expand an IPv6 address into its 8 groups of 16 bits.
 * @param {string} ip - A valid IPv6 address (net.isIPv6).
 * @returns {Array<number>}
 */
function expandIPv6(ip) {
  // drop the zone index (fe80::1%eth0)
  let address = ip.split('%')[0];
  // an embedded IPv4 address (::ffff:1.2.3.4) takes the last 2 groups
  const lastColon = address.lastIndexOf(':');
  const tail = address.slice(lastColon + 1);
  if (net.isIPv4(tail)) {
    const [a, b, c, d] = tail.split('.').map(Number);
    address = `${address.slice(0, lastColon + 1)}${(a * 256 + b).toString(16)}:${(c * 256 + d).toString(16)}`;
  }
  const [head, rest] = address.split('::');
  const headGroups = head ? head.split(':') : [];
  const restGroups = rest ? rest.split(':') : [];
  const zeros = rest === undefined ? [] : new Array(8 - headGroups.length - restGroups.length).fill('0');
  return [...headGroups, ...zeros, ...restGroups].map((group) => parseInt(group, 16));
}

/**
 * Key used by the IP based rate limiters.
 *
 * An IPv6 client usually controls at least a /64 and could rotate addresses
 * to bypass a per-address limit, so IPv6 clients are limited per /64.
 *  - IPv4: the address itself
 *  - IPv4-mapped IPv6 (::ffff:1.2.3.4): the IPv4 address
 *  - other IPv6: the /64 network, fully expanded (2001:0db8:0000:0000::/64)
 * Any other value is returned unchanged.
 * @param {string} ip
 * @returns {string}
 */
function getRateLimitKey(ip) {
  if (typeof ip !== 'string' || !net.isIPv6(ip)) {
    return ip;
  }
  const groups = expandIPv6(ip);
  const isIPv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isIPv4Mapped) {
    return [groups[6], groups[7]].flatMap((group) => [Math.floor(group / 256), group % 256]).join('.');
  }
  const prefix = groups.slice(0, 4).map((group) => group.toString(16).padStart(4, '0'));
  return `${prefix.join(':')}::/64`;
}

module.exports = {
  getRateLimitKey,
};
