var WebCrypto = require('node-webcrypto-ossl');
var should = require('should'); // eslint-disable-line no-unused-vars
var webcrypto = new WebCrypto();

describe('crypto.generateKeyPair', function () {
  it('should return public and private key', async function () {
    var crypto = require('../lib/crypto')({
      cryptoLib: webcrypto
    });
    var keys = await crypto.generateKeyPair();
    keys.should.have.property('rsaPublicKeyJwk');
    keys.should.have.property('rsaPrivateKeyJwk');
  });
});

describe('crypto.encryptPrivateKey', function () {
  it('should return an encrypted private key', async function () {
    var crypto = require('../lib/crypto')({
      cryptoLib: webcrypto
    });
    var keys = await crypto.generateKeyPair();
    var encrypted = await crypto.encryptPrivateKey('mypassword', keys.rsaKeys.privateKey);

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
    var encrypted = await crypto.encryptPrivateKey('mypassword', keys.rsaKeys.privateKey);
    await crypto.decryptPrivateKey('mypassword', encrypted.wrappedKey, 'RSA-OAEP', encrypted.salt, encrypted.iv);
  });
});

describe('crypto.decryptPrivateKey', function () {
  it('should encrypt a ecdsa private key and decrypt it again', async function () {
    var crypto = require('../lib/crypto')({
      cryptoLib: webcrypto
    });
    var keys = await crypto.generateKeyPair();
    var encrypted = await crypto.encryptPrivateKey('mypassword', keys.ecdsaKeys.privateKey);
    await crypto.decryptPrivateKey('mypassword', encrypted.wrappedKey, 'ECDSA', encrypted.salt, encrypted.iv);
  });
});

describe('crypto encrypt and decrypt', function () {
  it('should encrypt a message and decrypt it using the same key', async function () {
    var crypto = require('../lib/crypto')({
      cryptoLib: webcrypto
    });
    var keys = await crypto.generateKeyPair();
    var encryptedData = await crypto.encryptMessage(keys.rsaKeys.publicKey, keys.ecdsaKeys.privateKey, 'message');
    encryptedData.should.have.property('signature');
    var decrypted = await crypto.decryptMessage(keys.rsaKeys.privateKey, keys.ecdsaKeys.publicKey, encryptedData);
    decrypted.should.equal('message');
  });
});

describe('crypto encrypt and decrypt with decrypted private key', function () {
  it('should encrypt a message, and decrypt it using the decrypted private key', async function () {
    var crypto = require('../lib/crypto')({
      cryptoLib: webcrypto
    });
    var keys = await crypto.generateKeyPair();
    var encryptedKey = await crypto.encryptPrivateKey('mypassword', keys.rsaKeys.privateKey);
    var decryptedKey = await crypto.decryptPrivateKey('mypassword', encryptedKey.wrappedKey, 'RSA-OAEP', encryptedKey.salt, encryptedKey.iv);
    var encryptedData = await crypto.encryptMessage(keys.rsaKeys.publicKey, keys.ecdsaKeys.privateKey, 'message');
    var decrypted = await crypto.decryptMessage(decryptedKey, keys.ecdsaKeys.publicKey, encryptedData);
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
    var encryptedKey = await crypto.encryptPrivateKey('mypassword', keys.rsaKeys.privateKey);
    var decryptedKey = await crypto.decryptPrivateKey('mypassword', encryptedKey.wrappedKey, 'RSA-OAEP', encryptedKey.salt, encryptedKey.iv);
    var encryptedData = await crypto.encryptMessage(keys.rsaKeys.publicKey, keys.ecdsaKeys.privateKey, toSendStr);
    var decrypted = await crypto.decryptMessage(decryptedKey, keys.ecdsaKeys.publicKey, encryptedData);
    decrypted.should.equal(toSendStr);
  });
});
