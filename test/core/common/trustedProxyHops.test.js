const { expect } = require('chai');

const parseTrustedProxyHops = require('../../../core/common/trustedProxyHops');

describe('trusted proxy hops', () => {
  it('should trust one hop (the load balancer) by default', () => {
    expect(parseTrustedProxyHops(undefined)).to.equal(1);
    expect(parseTrustedProxyHops('')).to.equal(1);
    expect(parseTrustedProxyHops('  ')).to.equal(1);
  });

  it('should trust the configured number of hops', () => {
    expect(parseTrustedProxyHops('2')).to.equal(2);
    expect(parseTrustedProxyHops(' 3 ')).to.equal(3);
  });

  it('should refuse a value that is not a positive integer', () => {
    ['0', '-1', '1.5', 'two', 'true'].forEach((value) => {
      expect(() => parseTrustedProxyHops(value)).to.throw('Invalid TRUSTED_PROXY_HOPS');
    });
  });
});
