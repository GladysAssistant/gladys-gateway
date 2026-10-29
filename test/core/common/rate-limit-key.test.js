const { expect } = require('chai');

const { getRateLimitKey } = require('../../../core/common/rate-limit-key');

describe('getRateLimitKey', () => {
  it('should keep IPv4 addresses as is', () => {
    expect(getRateLimitKey('1.2.3.4')).to.equal('1.2.3.4');
    expect(getRateLimitKey('192.168.0.255')).to.equal('192.168.0.255');
  });

  it('should return the IPv4 address of an IPv4-mapped IPv6 address', () => {
    expect(getRateLimitKey('::ffff:1.2.3.4')).to.equal('1.2.3.4');
    expect(getRateLimitKey('::FFFF:127.0.0.1')).to.equal('127.0.0.1');
    expect(getRateLimitKey('0:0:0:0:0:ffff:0102:0304')).to.equal('1.2.3.4');
  });

  it('should return the same /64 key for IPv6 addresses of the same /64', () => {
    const key = '2001:0db8:0000:0000::/64';
    expect(getRateLimitKey('2001:db8::1')).to.equal(key);
    expect(getRateLimitKey('2001:0db8:0:0:abcd::2')).to.equal(key);
    expect(getRateLimitKey('2001:DB8:0000:0000:ffff:ffff:ffff:ffff')).to.equal(key);
    expect(getRateLimitKey('2001:db8::ffff:1.2.3.4')).to.equal(key);
    expect(getRateLimitKey('2001:db8::')).to.equal(key);
  });

  it('should return different keys for IPv6 addresses of different /64', () => {
    expect(getRateLimitKey('2001:db8:0:1::1')).to.equal('2001:0db8:0000:0001::/64');
    expect(getRateLimitKey('2001:db8:0:1::1')).not.to.equal(getRateLimitKey('2001:db8::1'));
    expect(getRateLimitKey('2a01:e0a:1:2:3:4:5:6')).to.equal('2a01:0e0a:0001:0002::/64');
    expect(getRateLimitKey('::1')).to.equal('0000:0000:0000:0000::/64');
    expect(getRateLimitKey('fe80::1%eth0')).to.equal('fe80:0000:0000:0000::/64');
  });

  it('should return invalid values unchanged', () => {
    expect(getRateLimitKey(undefined)).to.equal(undefined);
    expect(getRateLimitKey(null)).to.equal(null);
    expect(getRateLimitKey('')).to.equal('');
    expect(getRateLimitKey('not-an-ip')).to.equal('not-an-ip');
    expect(getRateLimitKey('2001:db8::g')).to.equal('2001:db8::g');
    expect(getRateLimitKey('1.2.3.256')).to.equal('1.2.3.256');
  });
});
