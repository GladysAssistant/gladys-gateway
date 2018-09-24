var WebCrypto = require('node-webcrypto-ossl');
var should = require('should'); // eslint-disable-line no-unused-vars
var webcrypto = new WebCrypto();

describe('crypto.generateKeyPair', function() {
  it('should return public and private key', async function() {
    var crypto = require('../lib/crypto')({cryptoLib: webcrypto});
    var keys = await crypto.generateKeyPair();
    keys.should.have.property('publicKeyJwk');
    keys.should.have.property('privateKeyJwk');
  });
});