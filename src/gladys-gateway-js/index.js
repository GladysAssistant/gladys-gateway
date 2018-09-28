const srpClient = require('secure-remote-password/client');
const axios = require('axios');
const pbkdf2 = require('@ctrlpanel/pbkdf2');
const encodeUtf8 = require('encode-utf8');
const arrayBufferToHex = require('array-buffer-to-hex');
const hexToArrayBuffer = require('hex-to-array-buffer');

const PBKDF2_HASH = 'SHA-256';
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;

module.exports = function ({ cryptoLib, serverUrl }) {

  const crypto = require('./lib/crypto')({ cryptoLib });

  async function signup(rawName, rawEmail, rawPassword, rawLanguage) {
    var name = rawName.trim();
    var email = rawEmail.trim().toLowerCase();
    var password = rawPassword.trim();
    var language = rawLanguage.trim().substr(0, 2).toLowerCase();

    // generate srp salt, privateKey and verifier
    const srpSalt = srpClient.generateSalt();
    const srpPrivateKey = arrayBufferToHex(await pbkdf2(encodeUtf8(`${email}:${password}`), hexToArrayBuffer(srpSalt), PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_HASH));
    const srpVerifier = srpClient.deriveVerifier(srpPrivateKey);

    // generate public/private key for the Gladys Gateway
    const { rsaKeys, ecdsaKeys, rsaPublicKeyJwk, ecdsaPublicKeyJwk } = await crypto.generateKeyPair();

    const rsaEncryptedPrivateKey = await crypto.encryptPrivateKey(password, rsaKeys.privateKey);
    const ecdsaEncryptedPrivateKey = await crypto.encryptPrivateKey(password, ecdsaKeys.privateKey);
  

    var newUser = {
      name,
      email,
      srp_salt: srpSalt,
      srp_verifier: srpVerifier,
      language,
      rsa_public_key: JSON.stringify(rsaPublicKeyJwk),
      rsa_encrypted_private_key: JSON.stringify(rsaEncryptedPrivateKey),
      ecdsa_public_key: JSON.stringify(ecdsaPublicKeyJwk),
      ecdsa_encrypted_private_key: JSON.stringify(ecdsaEncryptedPrivateKey)
    };
    
    return axios.post(serverUrl + '/users/signup', newUser);
  }

  async function login(rawEmail, rawPassword) {
    var email = rawEmail.trim().toLowerCase();
    var password = rawPassword.trim();

    // first step, we generate the clientEphemeral 
    const clientEphemeral = srpClient.generateEphemeral(); 
    
    // We ask the server for the salt
    const loginSaltResult = (await axios.post(serverUrl + '/users/login-salt', { email })).data;
    
    // Then send our clientEphemeral public + email, and retrieve the server ephemeral public
    const serverEphemeralResult = (await axios.post(serverUrl + '/users/login-generate-ephemeral', { email, client_ephemeral_public: clientEphemeral.public })).data;

    // We generate the key and wait  
    const srpPrivateKey = arrayBufferToHex(await pbkdf2(encodeUtf8(`${email}:${password}`), hexToArrayBuffer(loginSaltResult.srp_salt), PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_HASH));
    const clientSession = srpClient.deriveSession(clientEphemeral.secret, serverEphemeralResult.server_ephemeral_public, loginSaltResult.srp_salt, email, srpPrivateKey);
    
    // finally, we send the proof to the server
    const serverFinalLoginResult = (await axios.post(serverUrl + '/users/login-finalize', { login_session_key: serverEphemeralResult.login_session_key, client_session_proof: clientSession.proof })).data;

    // we verify that the server have derived the correct strong session key
    srpClient.verifySession(clientEphemeral.public, clientSession, serverFinalLoginResult.server_session_proof);

    return serverFinalLoginResult;
  }

  async function configureTwoFactor(accessToken) {
    return (await axios.post(serverUrl + '/users/two-factor-configure', {}, {
      headers: {
        authorization: accessToken
      }
    })).data;
  }

  async function confirmEmail(token) {
    return (await axios.post(serverUrl + '/users/verify', { email_confirmation_token: token })).data;
  }

  return {
    signup,
    login,
    configureTwoFactor,
    confirmEmail
  };
};