var WebCrypto = require('node-webcrypto-ossl');
var should = require('should'); // eslint-disable-line no-unused-vars
var webcrypto = new WebCrypto();

describe('crypto.generateKeyPair', function () {
  it('should return public and private key', async function () {
    var crypto = require('../lib/crypto')({
      cryptoLib: webcrypto
    });
    var keys = await crypto.generateKeyPair();
    keys.should.have.property('publicKeyJwk');
    keys.should.have.property('privateKeyJwk');
  });
});

describe('crypto.encryptPrivateKey', function () {
  it('should return an encrypted private key', async function () {
    var crypto = require('../lib/crypto')({
      cryptoLib: webcrypto
    });
    var keys = await crypto.generateKeyPair();
    var encrypted = await crypto.encryptPrivateKey('mypassword', keys.keys.privateKey);

    encrypted.should.have.property('wrappedKey');
    encrypted.should.have.property('iv');
    encrypted.should.have.property('salt');
  });
});

describe('crypto.decryptPrivateKey', function () {
  it('should encrypt a private key and decrypt it again', async function () {
    var crypto = require('../lib/crypto')({
      cryptoLib: webcrypto
    });
    var keys = await crypto.generateKeyPair();
    var encrypted = await crypto.encryptPrivateKey('mypassword', keys.keys.privateKey);
    var decrypted = await crypto.decryptPrivateKey('mypassword', encrypted.wrappedKey, encrypted.salt, encrypted.iv);
  });
});

describe('crypto encrypt and decrypt', function () {
  it('should encrypt a message and decrypt it using the same key', async function () {
    var crypto = require('../lib/crypto')({
      cryptoLib: webcrypto
    });
    var keys = await crypto.generateKeyPair();
    var encryptedData = await crypto.encryptMessage(keys.keys.publicKey, 'message');
    var decrypted = await crypto.decryptMessage(keys.keys.privateKey, encryptedData);
    decrypted.should.equal('message');
  });
});

describe('crypto encrypt and decrypt with decrypted private key', function () {
  it('should encrypt a message, and decrypt it using the decrypted private key', async function () {
    var crypto = require('../lib/crypto')({
      cryptoLib: webcrypto
    });
    var keys = await crypto.generateKeyPair();
    var encryptedKey = await crypto.encryptPrivateKey('mypassword', keys.keys.privateKey);
    var decryptedKey = await crypto.decryptPrivateKey('mypassword', encryptedKey.wrappedKey, encryptedKey.salt, encryptedKey.iv);
    var encryptedData = await crypto.encryptMessage(keys.keys.publicKey, 'message');
    var decrypted = await crypto.decryptMessage(decryptedKey, encryptedData);
    decrypted.should.equal('message');
  });
});

describe('crypto encrypt and decrypt with decrypted private key', function () {
  it('should encrypt a long message, and decrypt it using the decrypted private key', async function () {
    var toSend = [{
      'id': 2,
      'name': 'Salon',
      'house': 1,
      'deviceTypes': [{
        'name': 'Chromecast',
        'id': 6,
        'type': 'multilevel',
        'category': null,
        'tag': null,
        'unit': null,
        'min': -9999,
        'max': 9999,
        'display': 1,
        'sensor': 1,
        'identifier': 'f4:f5:d8:15:39:65',
        'device': 6,
        'service': 'bluetooth',
        'lastChanged': '2017-09-22T06:35:45.000Z',
        'lastValue': -42,
        'roomHouse': 1,
        'deviceTypeName': 'rssi'
      }]
    }];
    var toSendStr = JSON.stringify(toSend);
    var crypto = require('../lib/crypto')({
      cryptoLib: webcrypto
    });
    var keys = await crypto.generateKeyPair();
    var encryptedKey = await crypto.encryptPrivateKey('mypassword', keys.keys.privateKey);
    var decryptedKey = await crypto.decryptPrivateKey('mypassword', encryptedKey.wrappedKey, encryptedKey.salt, encryptedKey.iv);
    var encryptedData = await crypto.encryptMessage(keys.keys.publicKey, toSendStr);
    var decrypted = await crypto.decryptMessage(decryptedKey, encryptedData);
    decrypted.should.equal(toSendStr);
  });
});
