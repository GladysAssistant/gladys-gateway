const arrayBufferToHex = require('array-buffer-to-hex');
const hexToArrayBuffer = require('hex-to-array-buffer');
const { str2ab, ab2str, appendBuffer, sanitizePassPhrase, ab2strOldStyle, str2abOldStyle } = require('./helpers');

const PBKDF2_ITERATIONS = 100000;
const MESSAGE_MAX_LIFETIME = 5 * 60 * 1000; // a message expire after 5 minutes

module.exports = ({ cryptoLib }) => {
  async function exportKey(key) {
    const keyJwj = await cryptoLib.subtle.exportKey('jwk', key);
    return keyJwj;
  }

  async function generateKeyPair() {
    const rsaKeys = await cryptoLib.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: {
          name: 'SHA-256',
        },
      },
      true,
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
    );

    const ecdsaKeys = await cryptoLib.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256', // can be "P-256", "P-384", or "P-521"
      },
      true, // whether the key is extractable (i.e. can be used in exportKey)
      ['sign', 'verify'], // can be any combination of "sign" and "verify"
    );

    const rsaPublicKeyJwk = await cryptoLib.subtle.exportKey(
      'jwk', // can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
      rsaKeys.publicKey, // can be a publicKey or privateKey, as long as extractable was true
    );

    const rsaPrivateKeyJwk = await cryptoLib.subtle.exportKey('jwk', rsaKeys.privateKey);

    const ecdsaPublicKeyJwk = await cryptoLib.subtle.exportKey(
      'jwk', // can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
      ecdsaKeys.publicKey, // can be a publicKey or privateKey, as long as extractable was true
    );

    const ecdsaPrivateKeyJwk = await cryptoLib.subtle.exportKey('jwk', ecdsaKeys.privateKey);

    return {
      rsaKeys,
      ecdsaKeys,
      rsaPublicKeyJwk,
      rsaPrivateKeyJwk,
      ecdsaPublicKeyJwk,
      ecdsaPrivateKeyJwk,
    };
  }

  async function encryptPrivateKey(passphraseP, privateKey) {
    // sanitize passphrase
    const passphrase = sanitizePassPhrase(passphraseP);

    let salt = cryptoLib.getRandomValues(new Uint8Array(16));
    let iv = cryptoLib.getRandomValues(new Uint8Array(12));

    const key = await cryptoLib.subtle.importKey(
      'raw', // only 'raw' is allowed
      str2abOldStyle(passphrase), // your password
      {
        name: 'PBKDF2',
      },
      false, // whether the key is extractable (i.e. can be used in exportKey)
      ['deriveKey', 'deriveBits'], // can be any combination of 'deriveKey' and 'deriveBits'
    );

    const wrappingKey = await cryptoLib.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: { name: 'SHA-256' },
      },
      key, // your key from generateKey or importKey
      {
        name: 'AES-GCM', // can be any AES algorithm ('AES-CTR', 'AES-CBC', 'AES-CMAC', 'AES-GCM', 'AES-CFB', 'AES-KW', 'ECDH', 'DH', or 'HMAC')
        length: 256, // can be  128, 192, or 256
      },
      false, // whether the derived key is extractable (i.e. can be used in exportKey)
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'], // limited to the options in that algorithm's importKey
    );

    const wrappedKey = await cryptoLib.subtle.wrapKey(
      'jwk', // can be "jwk", "raw", "spki", or "pkcs8"
      privateKey, // the key you want to wrap, must be able to export to above format
      wrappingKey, // the AES-GCM key with "wrapKey" usage flag
      {
        name: 'AES-GCM',

        // Don't re-use initialization vectors!
        // Always generate a new iv every time your encrypt!
        // Recommended to use 12 bytes length
        iv,
      },
    );

    // transform iv and salt into exportable format for JSON.stringify
    iv = Array.from(iv);
    salt = Array.from(salt);

    return {
      wrappedKey: arrayBufferToHex(wrappedKey),
      salt,
      iv,
    };
  }

  async function encryptPrivateKeyJwk(passphraseP, privateKeyJwk) {
    // sanitize passphrase
    const passphrase = sanitizePassPhrase(passphraseP);

    let salt = cryptoLib.getRandomValues(new Uint8Array(16));
    let iv = cryptoLib.getRandomValues(new Uint8Array(12));
    let stringPrivateKey = JSON.stringify(privateKeyJwk);
    if (stringPrivateKey.length % 2 !== 0) {
      stringPrivateKey += ' ';
    }
    const arrayBufferKey = hexToArrayBuffer(stringPrivateKey);

    const key = await cryptoLib.subtle.importKey(
      'raw', // only 'raw' is allowed
      str2abOldStyle(passphrase), // your password
      {
        name: 'PBKDF2',
      },
      false, // whether the key is extractable (i.e. can be used in exportKey)
      ['deriveKey', 'deriveBits'], // can be any combination of 'deriveKey' and 'deriveBits'
    );

    const wrappingKey = await cryptoLib.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: { name: 'SHA-256' },
      },
      key, // your key from generateKey or importKey
      {
        name: 'AES-GCM', // can be any AES algorithm ('AES-CTR', 'AES-CBC', 'AES-CMAC', 'AES-GCM', 'AES-CFB', 'AES-KW', 'ECDH', 'DH', or 'HMAC')
        length: 256, // can be  128, 192, or 256
      },
      false, // whether the derived key is extractable (i.e. can be used in exportKey)
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'], // limited to the options in that algorithm's importKey
    );

    const wrappedKey = await cryptoLib.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128,
      },
      wrappingKey, // from generateKey or importKey above
      arrayBufferKey, // ArrayBuffer of data you want to encrypt
    );

    // transform iv and salt into exportable format for JSON.stringify
    iv = Array.from(iv);
    salt = Array.from(salt);

    return {
      wrappedKey: arrayBufferToHex(wrappedKey),
      salt,
      iv,
      isJwk: true,
    };
  }

  async function decryptPrivateKey(passphraseP, wrappedKey, type, saltP, ivP) {
    const iv = Uint8Array.from(ivP);
    const salt = Uint8Array.from(saltP);

    // sanitize passphrase
    const passphrase = sanitizePassPhrase(passphraseP);

    if (type !== 'RSA-OAEP' && type !== 'ECDSA') {
      throw new Error('decryptPrivateKey: Unsupported type. Only: RSA-OAEP and ECDSA');
    }

    const key = await cryptoLib.subtle.importKey(
      'raw', // only 'raw' is allowed
      str2abOldStyle(passphrase), // your password
      {
        name: 'PBKDF2',
      },
      false, // whether the key is extractable (i.e. can be used in exportKey)
      ['deriveKey', 'deriveBits'], // can be any combination of 'deriveKey' and 'deriveBits'
    );

    const wrappingKey = await cryptoLib.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: { name: 'SHA-256' },
      },
      key, // your key from generateKey or importKey
      {
        name: 'AES-GCM', // can be any AES algorithm ('AES-CTR', 'AES-CBC', 'AES-CMAC', 'AES-GCM', 'AES-CFB', 'AES-KW', 'ECDH', 'DH', or 'HMAC')
        length: 256, // can be  128, 192, or 256
      },
      false, // whether the derived key is extractable (i.e. can be used in exportKey)
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'], // limited to the options in that algorithm's importKey
    );

    let resultingKeyOptions = null;
    let keyUsage = null;

    if (type === 'RSA-OAEP') {
      resultingKeyOptions = {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: {
          name: 'SHA-256',
        },
      };

      keyUsage = ['decrypt', 'unwrapKey'];
    } else if (type === 'ECDSA') {
      resultingKeyOptions = {
        name: 'ECDSA',
        namedCurve: 'P-256',
      };
      keyUsage = ['sign'];
    }

    const decrypted = await cryptoLib.subtle.unwrapKey(
      'jwk',
      hexToArrayBuffer(wrappedKey),
      wrappingKey,
      {
        name: 'AES-GCM',
        iv,
      },
      resultingKeyOptions,
      true,
      keyUsage,
    );

    return decrypted;
  }

  async function decryptPrivateKeyJwk(passphraseP, wrappedKey, type, saltP, ivP) {
    const iv = Uint8Array.from(ivP);
    const salt = Uint8Array.from(saltP);

    // sanitize passphrase
    const passphrase = sanitizePassPhrase(passphraseP);

    if (type !== 'RSA-OAEP' && type !== 'ECDSA') {
      throw new Error('decryptPrivateKey: Unsupported type. Only: RSA-OAEP and ECDSA');
    }

    const key = await cryptoLib.subtle.importKey(
      'raw', // only 'raw' is allowed
      str2abOldStyle(passphrase), // your password
      {
        name: 'PBKDF2',
      },
      false, // whether the key is extractable (i.e. can be used in exportKey)
      ['deriveKey', 'deriveBits'], // can be any combination of 'deriveKey' and 'deriveBits'
    );

    const wrappingKey = await cryptoLib.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: { name: 'SHA-256' },
      },
      key, // your key from generateKey or importKey
      {
        name: 'AES-GCM', // can be any AES algorithm ('AES-CTR', 'AES-CBC', 'AES-CMAC', 'AES-GCM', 'AES-CFB', 'AES-KW', 'ECDH', 'DH', or 'HMAC')
        length: 256, // can be  128, 192, or 256
      },
      false, // whether the derived key is extractable (i.e. can be used in exportKey)
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'], // limited to the options in that algorithm's importKey
    );

    let resultingKeyOptions = null;
    let keyUsage = null;

    if (type === 'RSA-OAEP') {
      resultingKeyOptions = {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: {
          name: 'SHA-256',
        },
      };

      keyUsage = ['decrypt', 'unwrapKey'];
    } else if (type === 'ECDSA') {
      resultingKeyOptions = {
        name: 'ECDSA',
        namedCurve: 'P-256',
      };
      keyUsage = ['sign'];
    }

    const decryptedData = await cryptoLib.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv, // The initialization vector you used to encrypt
        tagLength: 128, // The tagLength you used to encrypt (if any)
      },
      wrappingKey, // from generateKey or importKey above
      hexToArrayBuffer(wrappedKey),
    );

    // we decrypt the data
    const strData = String.fromCharCode.apply(null, new Uint8Array(decryptedData));

    // then convert it to JS object
    const privateKeyJwk = JSON.parse(strData);

    // import the JWK key
    const decryptedKey = await cryptoLib.subtle.importKey('jwk', privateKeyJwk, resultingKeyOptions, true, keyUsage);

    return decryptedKey;
  }

  async function encryptMessage(publicKey, ecdsaPrivateKey, rawData, isNewEncoder = true) {
    // add timestamp to message to avoid replay attack
    const dataWithTimestamp = {
      data: rawData,
      timestamp: new Date().getTime(),
    };

    // stringify data
    const data = JSON.stringify(dataWithTimestamp);

    // first, we generate a symetric key
    const symetricKey = await cryptoLib.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256, // can be  128, 192, or 256
      },
      true, // whether the key is extractable (i.e. can be used in exportKey)
      ['encrypt', 'decrypt'], // can "encrypt", "decrypt", "wrapKey", or "unwrapKey"
    );

    const iv = cryptoLib.getRandomValues(new Uint8Array(12));

    const encryptedData = await cryptoLib.subtle.encrypt(
      {
        name: 'AES-GCM',

        // Don't re-use initialization vectors!
        // Always generate a new iv every time your encrypt!
        // Recommended to use 12 bytes length
        iv,

        // Tag length (optional)
        tagLength: 128, // can be 32, 64, 96, 104, 112, 120 or 128 (default)
      },
      symetricKey, // from generateKey or importKey above
      isNewEncoder ? str2ab(data) : str2abOldStyle(data), // ArrayBuffer of data you want to encrypt
    );

    const wrappedSymetricKey = await cryptoLib.subtle.wrapKey(
      'raw', // the export format, must be "raw" (only available sometimes)
      symetricKey, // the key you want to wrap, must be able to fit in RSA-OAEP padding
      publicKey, // the public key with "wrapKey" usage flag
      {
        // these are the wrapping key's algorithm options
        name: 'RSA-OAEP',
        hash: { name: 'SHA-256' },
      },
    );

    const hashOfData = await cryptoLib.subtle.digest(
      {
        name: 'SHA-256',
      },
      appendBuffer(encryptedData, wrappedSymetricKey),
    );

    const signature = await cryptoLib.subtle.sign(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' }, // can be "SHA-1", "SHA-256", "SHA-384", or "SHA-512"
      },
      ecdsaPrivateKey, // from generateKey or importKey above
      hashOfData, // ArrayBuffer of data you want to sign
    );

    return {
      iv: Array.from(iv),
      wrappedSymetricKey: arrayBufferToHex(wrappedSymetricKey),
      encryptedData: arrayBufferToHex(encryptedData),
      signature: arrayBufferToHex(signature),
      isNewEncoder,
    };
  }

  async function decryptMessage(privateKey, ecdsaPublicKey, data, options) {
    data.iv = Uint8Array.from(data.iv);

    const encryptedDataArrayBuffer = hexToArrayBuffer(data.encryptedData);
    const wrappedSymetricKeyArrayBuffer = hexToArrayBuffer(data.wrappedSymetricKey);

    const hashOfData = await cryptoLib.subtle.digest(
      {
        name: 'SHA-256',
      },
      appendBuffer(encryptedDataArrayBuffer, wrappedSymetricKeyArrayBuffer),
    );

    const isSignatureValid = await cryptoLib.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' }, // can be "SHA-1", "SHA-256", "SHA-384", or "SHA-512"
      },
      ecdsaPublicKey, // from generateKey or importKey above
      hexToArrayBuffer(data.signature), // ArrayBuffer of the signature
      hashOfData, // ArrayBuffer of the data
    );

    if (isSignatureValid === false) {
      throw new Error('decryptMessage: Invalid signature');
    }

    const decryptedSymetricKey = await cryptoLib.subtle.unwrapKey(
      'raw', // the import format, must be "raw" (only available sometimes)
      wrappedSymetricKeyArrayBuffer, // the key you want to unwrap
      privateKey, // the private key with "unwrapKey" usage flag
      {
        // these are the wrapping key's algorithm options
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: { name: 'SHA-256' },
      },
      {
        // this what you want the wrapped key to become (same as when wrapping)
        name: 'AES-GCM',
        length: 256,
      },
      false, // whether the key is extractable (i.e. can be used in exportKey)
      ['encrypt', 'decrypt'], // the usages you want the unwrapped key to have
    );

    const decryptedData = await cryptoLib.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: data.iv, // The initialization vector you used to encrypt
        tagLength: 128, // The tagLength you used to encrypt (if any)
      },
      decryptedSymetricKey, // from generateKey or importKey above
      encryptedDataArrayBuffer, // ArrayBuffer of the data
    );

    // we decrypt the data
    let strData = data.isNewEncoder ? ab2str(decryptedData) : ab2strOldStyle(decryptedData);
    strData = strData.replace(/\0/g, '');

    // then convert it to JS object
    const jsonData = JSON.parse(strData);

    const now = new Date().getTime();

    if (jsonData.timestamp + MESSAGE_MAX_LIFETIME < now && options.disableTimestampCheck) {
      throw new Error('EXPIRED_MESSAGE');
    }

    return jsonData.data;
  }

  async function importKey(jwkKey, type, isPublic) {
    let keyOptions = null;
    let usages = null;

    if (type === 'RSA-OEAP') {
      keyOptions = {
        name: 'RSA-OAEP',
        hash: { name: 'SHA-256' },
      };

      if (isPublic) {
        usages = ['encrypt', 'wrapKey'];
      } else {
        usages = ['decrypt', 'unwrapKey'];
      }
    } else if (type === 'ECDSA') {
      keyOptions = {
        name: 'ECDSA',
        namedCurve: 'P-256',
      };

      if (isPublic) {
        usages = ['verify'];
      } else {
        usages = ['sign'];
      }
    } else {
      throw new Error(`Unkown type ${type}`);
    }

    return cryptoLib.subtle.importKey(
      'jwk', // can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
      jwkKey,
      keyOptions,
      true, // whether the key is extractable (i.e. can be used in exportKey)
      usages,
    );
  }

  async function generateFingerprint(key) {
    let hash = await cryptoLib.subtle.digest(
      {
        name: 'SHA-256',
      },
      str2abOldStyle(key),
    );

    hash = arrayBufferToHex(hash);

    const withColons = hash.replace(/(.{2})(?=.)/g, '$1:');
    return withColons;
  }

  return {
    generateKeyPair,
    encryptPrivateKey,
    decryptPrivateKey,
    encryptPrivateKeyJwk,
    decryptPrivateKeyJwk,
    encryptMessage,
    decryptMessage,
    importKey,
    exportKey,
    generateFingerprint,
  };
};
