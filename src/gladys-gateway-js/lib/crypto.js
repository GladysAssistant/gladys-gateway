const arrayBufferToHex = require('array-buffer-to-hex');
const hexToArrayBuffer = require('hex-to-array-buffer');
const { str2ab, ab2str, appendBuffer, sanitizePassPhrase } = require('./helpers');

const PBKDF2_ITERATIONS = 100000;
const MESSAGE_MAX_LIFETIME = 5*60*1000; // a message expire after 5 minutes

module.exports = function ({ cryptoLib }) {

  async function generateKeyPair() {
    var rsaKeys = await cryptoLib.subtle.generateKey({
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: {
        name: 'SHA-256'
      },
    }, true, ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']);

    var ecdsaKeys = await cryptoLib.subtle.generateKey({
      name: 'ECDSA',
      namedCurve: 'P-256', //can be "P-256", "P-384", or "P-521"
    },
    true, //whether the key is extractable (i.e. can be used in exportKey)
    ['sign', 'verify'] //can be any combination of "sign" and "verify"
    );

    var rsaPublicKeyJwk = await cryptoLib.subtle.exportKey(
      'jwk', //can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
      rsaKeys.publicKey //can be a publicKey or privateKey, as long as extractable was true
    );

    var rsaPrivateKeyJwk = await cryptoLib.subtle.exportKey(
      'jwk',
      rsaKeys.privateKey
    );

    var ecdsaPublicKeyJwk = await cryptoLib.subtle.exportKey(
      'jwk', //can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
      ecdsaKeys.publicKey //can be a publicKey or privateKey, as long as extractable was true
    );

    var ecdsaPrivateKeyJwk = await cryptoLib.subtle.exportKey(
      'jwk',
      ecdsaKeys.privateKey
    ); 

    return {
      rsaKeys,
      ecdsaKeys,
      rsaPublicKeyJwk,
      rsaPrivateKeyJwk,
      ecdsaPublicKeyJwk,
      ecdsaPrivateKeyJwk
    };
  }

  async function encryptPrivateKey(passphrase, privateKey) {

    // sanitize passphrase
    passphrase = sanitizePassPhrase(passphrase);

    var salt = cryptoLib.getRandomValues(new Uint8Array(16));
    var iv = cryptoLib.getRandomValues(new Uint8Array(12));

    var key = await cryptoLib.subtle.importKey(
      'raw', //only 'raw' is allowed
      str2ab(passphrase), //your password
      {
        name: 'PBKDF2',
      },
      false, //whether the key is extractable (i.e. can be used in exportKey)
      ['deriveKey', 'deriveBits'] //can be any combination of 'deriveKey' and 'deriveBits'
    );

    var wrappingKey = await cryptoLib.subtle.deriveKey({
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: {name: 'SHA-256'},
    },
    key, //your key from generateKey or importKey
    {
      name: 'AES-GCM', //can be any AES algorithm ('AES-CTR', 'AES-CBC', 'AES-CMAC', 'AES-GCM', 'AES-CFB', 'AES-KW', 'ECDH', 'DH', or 'HMAC')
      length: 256, //can be  128, 192, or 256
    },
    false, //whether the derived key is extractable (i.e. can be used in exportKey)
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'] //limited to the options in that algorithm's importKey
    );

    var wrappedKey = await cryptoLib.subtle.wrapKey(
      'jwk', //can be "jwk", "raw", "spki", or "pkcs8"
      privateKey, //the key you want to wrap, must be able to export to above format
      wrappingKey, //the AES-GCM key with "wrapKey" usage flag
      {  
        name: 'AES-GCM',
  
        //Don't re-use initialization vectors!
        //Always generate a new iv every time your encrypt!
        //Recommended to use 12 bytes length
        iv: iv
      }
    );

    // transform iv and salt into exportable format for JSON.stringify
    iv = Array.from(iv);
    salt = Array.from(salt);

    return {
      wrappedKey: arrayBufferToHex(wrappedKey),
      salt,
      iv
    };
  }

  async function decryptPrivateKey(passphrase, wrappedKey, type, salt, iv){

    iv = Uint8Array.from(iv);
    salt = Uint8Array.from(salt);

    // sanitize passphrase
    passphrase = sanitizePassPhrase(passphrase);
    
    if(type !== 'RSA-OAEP' && type !== 'ECDSA') {
      throw new Error('decryptPrivateKey: Unsupported type. Only: RSA-OAEP and ECDSA');
    }
    
    var key = await cryptoLib.subtle.importKey(
      'raw', //only 'raw' is allowed
      str2ab(passphrase), //your password
      {
        name: 'PBKDF2',
      },
      false, //whether the key is extractable (i.e. can be used in exportKey)
      ['deriveKey', 'deriveBits'] //can be any combination of 'deriveKey' and 'deriveBits'
    );

    var wrappingKey = await cryptoLib.subtle.deriveKey({
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: {name: 'SHA-256'},
    },
    key, //your key from generateKey or importKey
    {
      name: 'AES-GCM', //can be any AES algorithm ('AES-CTR', 'AES-CBC', 'AES-CMAC', 'AES-GCM', 'AES-CFB', 'AES-KW', 'ECDH', 'DH', or 'HMAC')
      length: 256, //can be  128, 192, or 256
    },
    false, //whether the derived key is extractable (i.e. can be used in exportKey)
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'] //limited to the options in that algorithm's importKey
    );

    var resultingKeyOptions = null;
    var keyUsage = null;

    if(type === 'RSA-OAEP') {
      resultingKeyOptions = {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: {
          name: 'SHA-256'
        }
      };

      keyUsage = ['decrypt', 'unwrapKey'];
    } else if(type === 'ECDSA') {
      resultingKeyOptions = {
        name: 'ECDSA',
        namedCurve: 'P-256'
      };
      keyUsage = ['sign'];
    }

    var decrypted = await cryptoLib.subtle.unwrapKey(
      'jwk', hexToArrayBuffer(wrappedKey), 
      wrappingKey, 
      {
        name: 'AES-GCM',
        iv: iv
      },
      resultingKeyOptions, true, keyUsage
    );

    return decrypted;
  }

  async function encryptMessage(publicKey, ecdsaPrivateKey, data) {

    // add timestamp to message to avoid replay attack
    data.timestamp = new Date().getTime();
    
    // stringify data
    data = JSON.stringify(data);
    
    // first, we generate a symetric key
    var symetricKey = await cryptoLib.subtle.generateKey({
      name: 'AES-GCM',
      length: 256, //can be  128, 192, or 256
    },
    true, //whether the key is extractable (i.e. can be used in exportKey)
    ['encrypt', 'decrypt'] //can "encrypt", "decrypt", "wrapKey", or "unwrapKey"
    );

    var iv = cryptoLib.getRandomValues(new Uint8Array(12));

    var encryptedData = await cryptoLib.subtle.encrypt({
      name: 'AES-GCM',

      //Don't re-use initialization vectors!
      //Always generate a new iv every time your encrypt!
      //Recommended to use 12 bytes length
      iv: iv,

      //Tag length (optional)
      tagLength: 128, //can be 32, 64, 96, 104, 112, 120 or 128 (default)
    },
    symetricKey, //from generateKey or importKey above
    str2ab(data) //ArrayBuffer of data you want to encrypt
    );

    var wrappedSymetricKey = await cryptoLib.subtle.wrapKey(
      'raw', //the export format, must be "raw" (only available sometimes)
      symetricKey, //the key you want to wrap, must be able to fit in RSA-OAEP padding
      publicKey, //the public key with "wrapKey" usage flag
      {   //these are the wrapping key's algorithm options
        name: 'RSA-OAEP',
        hash: {name: 'SHA-256'},
      }
    );

    var hashOfData = await cryptoLib.subtle.digest({
      name: 'SHA-256',
    },
    appendBuffer(encryptedData, wrappedSymetricKey)
    );

    var signature = await cryptoLib.subtle.sign({
      name: 'ECDSA',
      hash: {name: 'SHA-256'}, //can be "SHA-1", "SHA-256", "SHA-384", or "SHA-512"
    },
    ecdsaPrivateKey, //from generateKey or importKey above
    hashOfData //ArrayBuffer of data you want to sign
    );

    return {
      iv: Array.from(iv), 
      wrappedSymetricKey: arrayBufferToHex(wrappedSymetricKey),
      encryptedData: arrayBufferToHex(encryptedData),
      signature: arrayBufferToHex(signature)
    };
  }

  async function decryptMessage(privateKey, ecdsaPublicKey, data) {

    data.iv = Uint8Array.from(data.iv);

    var encryptedDataArrayBuffer = hexToArrayBuffer(data.encryptedData);
    var wrappedSymetricKeyArrayBuffer = hexToArrayBuffer(data.wrappedSymetricKey);

    var hashOfData = await cryptoLib.subtle.digest({
      name: 'SHA-256',
    },
    appendBuffer(encryptedDataArrayBuffer, wrappedSymetricKeyArrayBuffer)
    );

    var isSignatureValid = await cryptoLib.subtle.verify({
      name: 'ECDSA',
      hash: {name: 'SHA-256'}, //can be "SHA-1", "SHA-256", "SHA-384", or "SHA-512"
    },
    ecdsaPublicKey, //from generateKey or importKey above
    hexToArrayBuffer(data.signature), //ArrayBuffer of the signature
    hashOfData //ArrayBuffer of the data
    );

    if(isSignatureValid === false) {
      throw new Error('decryptMessage: Invalid signature');
    }

    var decryptedSymetricKey = await cryptoLib.subtle.unwrapKey(
      'raw', //the import format, must be "raw" (only available sometimes)
      wrappedSymetricKeyArrayBuffer, //the key you want to unwrap
      privateKey, //the private key with "unwrapKey" usage flag
      {   //these are the wrapping key's algorithm options
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: { name: 'SHA-256' },
      },
      {   //this what you want the wrapped key to become (same as when wrapping)
        name: 'AES-GCM',
        length: 256
      },
      false, //whether the key is extractable (i.e. can be used in exportKey)
      ['encrypt', 'decrypt'] //the usages you want the unwrapped key to have
    );

    var decryptedData = await cryptoLib.subtle.decrypt({
      name: 'AES-GCM',
      iv: data.iv, //The initialization vector you used to encrypt
      tagLength: 128, //The tagLength you used to encrypt (if any)
    },
    decryptedSymetricKey, //from generateKey or importKey above
    encryptedDataArrayBuffer //ArrayBuffer of the data
    );

    // we decrypt the data
    var strData = ab2str(decryptedData);

    // then convert it to JS object
    var jsonData = JSON.parse(strData);

    var now = new Date().getTime();

    if(jsonData.timestamp + MESSAGE_MAX_LIFETIME < now) {
      throw new Error('EXPIRED_MESSAGE');
    }

    return jsonData;
  }

  async function importKey(jwkKey, type, isPublic) {

    var keyOptions = null;
    var usages = null;

    if(type === 'RSA-OEAP') {
      keyOptions = { 
        name: 'RSA-OAEP',
        hash: {name: 'SHA-256'},
      };  
      
      if(isPublic) {
        usages = ['encrypt', 'wrapKey'];
      } else {
        usages = ['decrypt', 'unWrapKey'];
      }
    } else if (type === 'ECDSA') {
      keyOptions = { 
        name: 'ECDSA',
        namedCurve: 'P-256'
      };

      if(isPublic) {
        usages = ['verify'];
      } else {
        usages = ['sign'];
      }
    } else {
      throw new Error('Unkown type ' + type);
    }

    return cryptoLib.subtle.importKey(
      'jwk', //can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
      jwkKey,
      keyOptions,
      false, //whether the key is extractable (i.e. can be used in exportKey)
      usages
    );
  }

  return {
    generateKeyPair,
    encryptPrivateKey,
    decryptPrivateKey,
    encryptMessage,
    decryptMessage,
    importKey
  };
};