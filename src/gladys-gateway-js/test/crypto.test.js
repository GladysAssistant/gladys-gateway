const WebCrypto = require('node-webcrypto-ossl');
const should = require('should'); // eslint-disable-line
const webcrypto = new WebCrypto();

const Crypto = require('../lib/crypto');

describe('crypto.generateKeyPair', () => {
  it('should return public and private key', async () => {
    const crypto = Crypto({
      cryptoLib: webcrypto,
    });
    const keys = await crypto.generateKeyPair();
    keys.should.have.property('rsaPublicKeyJwk');
    keys.should.have.property('rsaPrivateKeyJwk');
  });
});

describe('crypto.encryptPrivateKey', () => {
  it('should return an encrypted private key', async () => {
    const crypto = Crypto({
      cryptoLib: webcrypto,
    });
    const keys = await crypto.generateKeyPair();
    const encrypted = await crypto.encryptPrivateKey('mypassword', keys.rsaKeys.privateKey);

    encrypted.should.have.property('wrappedKey');
    encrypted.should.have.property('iv');
    encrypted.should.have.property('salt');
  });
});

describe('crypto.encryptPrivateKey', () => {
  it('compare encryption', async () => {
    const crypto = Crypto({
      cryptoLib: webcrypto,
    });
    const keys = await crypto.generateKeyPair();

    const encrypted = await crypto.encryptPrivateKey('mypassword', keys.rsaKeys.privateKey);
    await crypto.decryptPrivateKeyJwk('mypassword', encrypted.wrappedKey, 'RSA-OAEP', encrypted.salt, encrypted.iv);
  });
});

describe('crypto.encryptPrivateKeyJwk', () => {
  it('should return an encrypted private key', async () => {
    const crypto = Crypto({
      cryptoLib: webcrypto,
    });
    const keys = await crypto.generateKeyPair();
    const encrypted = await crypto.encryptPrivateKeyJwk('mypassword', keys.rsaKeys.privateKey);

    encrypted.should.have.property('wrappedKey');
    encrypted.should.have.property('iv');
    encrypted.should.have.property('salt');
    encrypted.should.have.property('isJwk', true);
  });
});

describe('crypto.decryptPrivateKey', () => {
  it('should encrypt a private key and decrypt it again', async () => {
    const crypto = Crypto({
      cryptoLib: webcrypto,
    });
    const keys = await crypto.generateKeyPair();
    const encrypted = await crypto.encryptPrivateKey('mypassword', keys.rsaKeys.privateKey);
    await crypto.decryptPrivateKey('mypassword', encrypted.wrappedKey, 'RSA-OAEP', encrypted.salt, encrypted.iv);
  });
});

describe('crypto.decryptPrivateKeyJwk', () => {
  it('should encrypt a private key and decrypt it again', async () => {
    const crypto = Crypto({
      cryptoLib: webcrypto,
    });
    const keys = await crypto.generateKeyPair();
    // const encrypted = await crypto.encryptPrivateKeyJwk('mypassword', keys.rsaPrivateKeyJwk);
    const encrypted = await crypto.encryptPrivateKey('mypassword', keys.rsaKeys.privateKey);
    await crypto.decryptPrivateKeyJwk('mypassword', encrypted.wrappedKey, 'RSA-OAEP', encrypted.salt, encrypted.iv);
  });
});

describe('crypto.decryptPrivateKey', () => {
  it('should encrypt a ecdsa private key and decrypt it again', async () => {
    const crypto = Crypto({
      cryptoLib: webcrypto,
    });
    const keys = await crypto.generateKeyPair();
    const encrypted = await crypto.encryptPrivateKey('mypassword', keys.ecdsaKeys.privateKey);
    await crypto.decryptPrivateKey('mypassword', encrypted.wrappedKey, 'ECDSA', encrypted.salt, encrypted.iv);
  });
});

describe('crypto encrypt and decrypt', () => {
  it('should encrypt a message and decrypt it using the same key', async () => {
    const crypto = Crypto({
      cryptoLib: webcrypto,
    });
    const keys = await crypto.generateKeyPair();
    const data = {
      message: 'hey',
    };
    const encryptedData = await crypto.encryptMessage(keys.rsaKeys.publicKey, keys.ecdsaKeys.privateKey, data);
    encryptedData.should.have.property('signature');
    const decrypted = await crypto.decryptMessage(keys.rsaKeys.privateKey, keys.ecdsaKeys.publicKey, encryptedData);
    decrypted.should.have.property('message', 'hey');
  });
});

describe('crypto encrypt and decrypt with decrypted private key', () => {
  it('should encrypt a message, and decrypt it using the decrypted private key', async () => {
    const crypto = Crypto({
      cryptoLib: webcrypto,
    });
    const keys = await crypto.generateKeyPair();
    const encryptedKey = await crypto.encryptPrivateKey('mypassword', keys.rsaKeys.privateKey);
    const decryptedKey = await crypto.decryptPrivateKey(
      'mypassword',
      encryptedKey.wrappedKey,
      'RSA-OAEP',
      encryptedKey.salt,
      encryptedKey.iv,
    );
    const data = {
      message: 'hey',
    };
    const encryptedData = await crypto.encryptMessage(keys.rsaKeys.publicKey, keys.ecdsaKeys.privateKey, data);
    const decrypted = await crypto.decryptMessage(decryptedKey, keys.ecdsaKeys.publicKey, encryptedData);
    decrypted.should.have.property('message', 'hey');
  });
});

describe('crypto encrypt and decrypt with decrypted private key', () => {
  it('should encrypt a message, and decrypt it using the decrypted private key JWK', async () => {
    const crypto = Crypto({
      cryptoLib: webcrypto,
    });
    const keys = await crypto.generateKeyPair();
    const encryptedKey = await crypto.encryptPrivateKey('mypassword', keys.rsaKeys.privateKey);
    const decryptedKey = await crypto.decryptPrivateKeyJwk(
      'mypassword',
      encryptedKey.wrappedKey,
      'RSA-OAEP',
      encryptedKey.salt,
      encryptedKey.iv,
    );
    const data = {
      hey: true,
    };
    const ecdsaEncryptedKey = await crypto.encryptPrivateKey('mypassword', keys.ecdsaKeys.privateKey);
    const ecdsaDecryptedKey = await crypto.decryptPrivateKeyJwk(
      'mypassword',
      ecdsaEncryptedKey.wrappedKey,
      'ECDSA',
      ecdsaEncryptedKey.salt,
      ecdsaEncryptedKey.iv,
    );
    const encryptedData = await crypto.encryptMessage(keys.rsaKeys.publicKey, ecdsaDecryptedKey, data);
    const decrypted = await crypto.decryptMessage(decryptedKey, keys.ecdsaKeys.publicKey, encryptedData);
    decrypted.should.have.property('hey', true);
  });
});

describe('crypto encrypt and decrypt with decrypted private key', () => {
  it('should encrypt a long message, and decrypt it using the decrypted private key', async () => {
    const toSend = [
      {
        id: 2,
        name: 'Salon',
        house: 1,
        deviceTypes: [
          {
            name: 'Chromecast',
            id: 6,
            type: 'multilevel',
            category: null,
            tag: null,
            unit: null,
            min: -9999,
            max: 9999,
            display: 1,
            sensor: 1,
            identifier: 'f4:f5:d8:15:39:65',
            device: 6,
            service: 'bluetooth',
            lastChanged: '2017-09-22T06:35:45.000Z',
            lastValue: -42,
            roomHouse: 1,
            deviceTypeName: 'rssi',
          },
        ],
      },
    ];
    const payload = {
      toSend,
    };
    const crypto = Crypto({
      cryptoLib: webcrypto,
    });
    const keys = await crypto.generateKeyPair();
    const encryptedKey = await crypto.encryptPrivateKey('mypassword', keys.rsaKeys.privateKey);
    const decryptedKey = await crypto.decryptPrivateKey(
      'mypassword',
      encryptedKey.wrappedKey,
      'RSA-OAEP',
      encryptedKey.salt,
      encryptedKey.iv,
    );
    const encryptedData = await crypto.encryptMessage(keys.rsaKeys.publicKey, keys.ecdsaKeys.privateKey, payload);
    const decrypted = await crypto.decryptMessage(decryptedKey, keys.ecdsaKeys.publicKey, encryptedData);
    decrypted.should.deepEqual(payload);
  });
});
