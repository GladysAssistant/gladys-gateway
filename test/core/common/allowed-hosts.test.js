const { expect } = require('chai');

const { parseAllowedHosts, isAllowedHost, getSocketAllowRequest } = require('../../../core/common/allowed-hosts');

describe('parseAllowedHosts', () => {
  it('should trim, lowercase and ignore empty entries', () => {
    expect(parseAllowedHosts(' API.gladysgateway.com, ,other.example.com ,')).to.deep.equal([
      'api.gladysgateway.com',
      'other.example.com',
    ]);
  });

  it('should return an empty list when unset or empty', () => {
    expect(parseAllowedHosts(undefined)).to.deep.equal([]);
    expect(parseAllowedHosts('')).to.deep.equal([]);
    expect(parseAllowedHosts(' , ')).to.deep.equal([]);
  });
});

describe('isAllowedHost', () => {
  const allowedHosts = ['api.gladysgateway.com'];

  it('should allow an exact match', () => {
    expect(isAllowedHost('api.gladysgateway.com', allowedHosts)).to.equal(true);
  });

  it('should reject another host', () => {
    expect(isAllowedHost('random.example.com', allowedHosts)).to.equal(false);
    expect(isAllowedHost('gladysgateway.com', allowedHosts)).to.equal(false);
    expect(isAllowedHost('203.0.113.1', allowedHosts)).to.equal(false);
  });

  it('should ignore the case', () => {
    expect(isAllowedHost('API.GladysGateway.COM', allowedHosts)).to.equal(true);
  });

  it('should ignore the port', () => {
    expect(isAllowedHost('api.gladysgateway.com:443', allowedHosts)).to.equal(true);
    expect(isAllowedHost('random.example.com:443', allowedHosts)).to.equal(false);
  });

  it('should ignore one trailing dot', () => {
    expect(isAllowedHost('api.gladysgateway.com.', allowedHosts)).to.equal(true);
    expect(isAllowedHost('api.gladysgateway.com.:443', allowedHosts)).to.equal(true);
    expect(isAllowedHost('api.gladysgateway.com..', allowedHosts)).to.equal(false);
  });

  it('should reject a missing or empty header', () => {
    expect(isAllowedHost(undefined, allowedHosts)).to.equal(false);
    expect(isAllowedHost('', allowedHosts)).to.equal(false);
  });

  it('should reject a bracketed IPv6 host without crashing', () => {
    expect(isAllowedHost('[2001:db8::1]:443', allowedHosts)).to.equal(false);
    expect(isAllowedHost('[2001:db8::1]', allowedHosts)).to.equal(false);
    expect(isAllowedHost('[2001:db8::1', allowedHosts)).to.equal(false);
    expect(isAllowedHost('2001:db8::1', allowedHosts)).to.equal(false);
  });

  it('should allow a bracketed IPv6 host when listed', () => {
    expect(isAllowedHost('[2001:db8::1]:443', ['[2001:db8::1]'])).to.equal(true);
  });

  it('should allow any of several allowed hosts', () => {
    const hosts = ['api.gladysgateway.com', 'other.example.com'];
    expect(isAllowedHost('api.gladysgateway.com', hosts)).to.equal(true);
    expect(isAllowedHost('other.example.com:8080', hosts)).to.equal(true);
    expect(isAllowedHost('random.example.com', hosts)).to.equal(false);
  });

  it('should allow everything when the list is empty (filter disabled)', () => {
    expect(isAllowedHost('random.example.com', [])).to.equal(true);
    expect(isAllowedHost(undefined, [])).to.equal(true);
  });
});

describe('getSocketAllowRequest', () => {
  function allowRequest(allowedHosts, host) {
    return new Promise((resolve) => {
      getSocketAllowRequest(allowedHosts)({ headers: { host } }, (err, success) => resolve({ err, success }));
    });
  }

  it('should refuse the handshake of a disallowed host', async () => {
    const { err, success } = await allowRequest(['api.gladysgateway.com'], 'random.example.com');
    expect(success).to.equal(false);
    expect(err).to.equal('Host not allowed');
  });

  it('should accept the handshake of an allowed host', async () => {
    const { err, success } = await allowRequest(['api.gladysgateway.com'], 'api.gladysgateway.com:443');
    expect(success).to.equal(true);
    expect(err).to.equal(null);
  });

  it('should accept every handshake when the filter is disabled', async () => {
    const { success } = await allowRequest([], 'random.example.com');
    expect(success).to.equal(true);
  });
});
