module.exports = function ({ cryptoLib }) {

  async function generateKeyPair() {
    var keys = await cryptoLib.subtle.generateKey({
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: {
        name: 'SHA-256'
      },
    }, true, ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']);

    var publicKeyJwk = await cryptoLib.subtle.exportKey(
      'jwk', //can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
      keys.publicKey //can be a publicKey or privateKey, as long as extractable was true
    );

    var privateKeyJwk = await cryptoLib.subtle.exportKey(
      'jwk',
      keys.privateKey
    );

    return {
      keys,
      publicKeyJwk,
      privateKeyJwk
    };
  }

  return {
    generateKeyPair
  };
};