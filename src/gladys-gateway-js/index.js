const srpClient = require('secure-remote-password/client');
const axios = require('axios');
const pbkdf2 = require('@ctrlpanel/pbkdf2');
const encodeUtf8 = require('encode-utf8');
const arrayBufferToHex = require('array-buffer-to-hex');
const hexToArrayBuffer = require('hex-to-array-buffer');
const io = require('socket.io-client');

const PBKDF2_HASH = 'SHA-256';
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;

module.exports = function ({ cryptoLib, serverUrl }) {

  const crypto = require('./lib/crypto')({ cryptoLib });

  const state = {
    socket: null,
    refreshToken: null,
    rsaKeys: null,
    ecdsaKeys: null,
    gladysInstance: null,
    gladysInstancePublicKey: null,
    gladysInstanceEcdsaPublicKey: null
  };

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
  
    state.rsaKeys = rsaKeys;
    state.ecdsaKeys = ecdsaKeys;

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

  async function loginTwoFactor(accessToken, password, code) {

    const result = (await axios.post(serverUrl + '/users/login-two-factor', { two_factor_code: code }, {
      headers: {
        authorization: accessToken
      }
    }));

    const loginData = result.data;

    loginData.rsa_encrypted_private_key = JSON.parse(loginData.rsa_encrypted_private_key);
    loginData.ecdsa_encrypted_private_key = JSON.parse(loginData.ecdsa_encrypted_private_key);

    // We decrypt the encrypted RSA private key
    state.rsaKeys = {
      private_key: await crypto.decryptPrivateKey(
        password, 
        loginData.rsa_encrypted_private_key.wrappedKey, 
        'RSA-OAEP',
        loginData.rsa_encrypted_private_key.salt,
        loginData.rsa_encrypted_private_key.iv  
      )
    };

    // We decrypt the encrypted ECDSA private key
    state.ecdsaKeys = {
      private_key: await crypto.decryptPrivateKey(
        password, 
        loginData.ecdsa_encrypted_private_key.wrappedKey, 
        'ECDSA',
        loginData.ecdsa_encrypted_private_key.salt,
        loginData.ecdsa_encrypted_private_key.iv  
      )
    };

    state.gladysInstance = await getInstance(loginData.access_token);

    if(state.gladysInstance) {
      state.gladysInstancePublicKey = await crypto.importKey(JSON.parse(state.gladysInstance.rsa_public_key), 'RSA-OEAP', true);
      state.gladysInstanceEcdsaPublicKey = await crypto.importKey(JSON.parse(state.gladysInstance.ecdsa_public_key), 'ECDSA', true); 
    } 

    return {
      gladysInstance: state.gladysInstance,
      gladysInstancePublicKey: state.gladysInstancePublicKey,
      rsaKeys: state.rsaKeys,
      ecdsaKeys: state.ecdsaKeys,
      refreshToken: loginData.refresh_token,
      accessToken: loginData.access_token
    };
  }

  async function loginInstance(twoFactorToken, twoFactorCode) {
    
    const loginData = (await axios.post(serverUrl + '/users/login-two-factor', { two_factor_code: twoFactorCode }, {
      headers: {
        authorization: twoFactorToken
      }
    })).data;

    state.accessToken = loginData.access_token;
    state.refreshToken = loginData.refreshToken;

    const gladysInstance = await getInstance(loginData.access_token);

    return gladysInstance;
  }

  async function createInstance(name) {
    const { rsaKeys, ecdsaKeys, rsaPublicKeyJwk, ecdsaPublicKeyJwk, rsaPrivateKeyJwk, ecdsaPrivateKeyJwk } = await crypto.generateKeyPair();

    var instance = {
      name,
      rsa_public_key: JSON.stringify(rsaPublicKeyJwk),
      ecdsa_public_key: JSON.stringify(ecdsaPublicKeyJwk)
    };
    
    const createdInstance = (await axios.post(serverUrl + '/instances', instance, {
      headers: {
        authorization: state.accessToken
      }
    })).data;

    state.gladysInstance = createdInstance;
    state.gladysInstanceRsaKeys = rsaKeys;
    state.gladysInstanceEcdsaKeys = ecdsaKeys;

    return {
      instance: createdInstance,
      rsaPrivateKeyJwk,
      ecdsaPrivateKeyJwk
    };
  }

  async function configureTwoFactor(accessToken) {
    return (await axios.post(serverUrl + '/users/two-factor-configure', {}, {
      headers: {
        authorization: accessToken
      }
    })).data;
  }

  async function enableTwoFactor(accessToken, twoFactorCode) {
    return (await axios.post(serverUrl + '/users/two-factor-enable', { two_factor_code: twoFactorCode }, {
      headers: {
        authorization: accessToken
      }
    })).data;
  }

  async function confirmEmail(token) {
    return (await axios.post(serverUrl + '/users/verify', { email_confirmation_token: token })).data;
  }

  async function getAccessToken(refreshToken) {
    return (await axios.get(serverUrl + '/users/access-token', {
      headers: {
        authorization: refreshToken
      }
    })).data.access_token;
  }

  async function getAccessTokenInstance(refreshToken) {
    return (await axios.get(serverUrl + '/instances/access-token', {
      headers: {
        authorization: refreshToken
      }
    })).data.access_token;
  }

  async function getMyself() {
    return (await axios.get(serverUrl + '/users/me', {
      headers: {
        authorization: state.accessToken
      }
    })).data;
  }

  async function getUsersInAccount() {
    return (await axios.get(serverUrl + '/accounts/users', {
      headers: {
        authorization: state.accessToken
      }
    })).data;
  }

  async function inviteUser(email) {
    return (await axios.post(serverUrl + '/invitations', { email }, {
      headers: {
        authorization: state.accessToken
      }
    })).data;
  }

  async function getInstance(accessToken) {
    let instances = (await axios.get(serverUrl + '/instances', {
      headers: {
        authorization: accessToken
      }
    })).data;

    if(instances.length === 0) {
      return null;
    }    
    
    return instances[0];
  }

  async function getUsersInstance(){
    return (await axios.get(serverUrl + '/instances/users', {
      headers: {
        authorization: state.accessToken
      }
    })).data;
  }

  async function userConnect(refreshToken) {
    state.refreshToken = refreshToken;
    const accessToken = await getAccessToken(refreshToken);
    state.accessToken = accessToken;

    return new Promise(function(resolve, reject) {
      state.socket = io(serverUrl);

      state.socket.on('connect', function(){
        state.socket.emit('user-authentication', { access_token: accessToken }, function(res) {
          if(res.authenticated) {
            resolve();
          } else {
            reject(new Error('Invalid JWT'));
          }
        });
      });

      state.socket.on('disconnect', function(){
        console.log('Socket disconnected');
      });
    });
  }

  async function instanceConnect(refreshToken, rsaPrivateKeyJwk, ecdsaPrivateKeyJwk, callbackMessage) {
    
    state.refreshToken = refreshToken;

    // We import the RSA private key
    state.rsaKeys = {
      private_key: await crypto.importKey(rsaPrivateKeyJwk, 'RSA-OEAP')
    };

    // We import the ECDSA private key
    state.ecdsaKeys = {
      private_key: await crypto.importKey(ecdsaPrivateKeyJwk, 'ECDSA')
    };

    const accessToken = await getAccessTokenInstance(refreshToken);
    state.accessToken = accessToken;

    return new Promise(function(resolve, reject) {
      state.socket = io(serverUrl);

      state.socket.on('connect', function(){
        state.socket.emit('instance-authentication', { access_token: accessToken }, function(res) {
          if(res.authenticated) {
            resolve();
          } else {
            reject(new Error('Invalid JWT'));
          }
        });

        state.socket.on('message', async function(data, fn) {
          console.log('Message received');
          
          var users = await getUsersInstance();
          
          var ecdsaPublicKey = null;
          var rsaPublicKey = null;
          
          users.forEach((user) => {
            if(user.id == data.sender_id) {
              ecdsaPublicKey = JSON.parse(user.ecdsa_public_key);
              rsaPublicKey = JSON.parse(user.rsa_public_key);
            }
          });

          if(ecdsaPublicKey == null || rsaPublicKey == null) {
            throw new Error('User not found');
          }

          ecdsaPublicKey = await crypto.importKey(ecdsaPublicKey, 'ECDSA', true);
          rsaPublicKey = await crypto.importKey(rsaPublicKey, 'RSA-OEAP', true);

          var decryptedMessage = await crypto.decryptMessage(state.rsaKeys.private_key, ecdsaPublicKey, data.encryptedMessage);
          
          callbackMessage(decryptedMessage, async function(response) {
            var encryptedResponse = await crypto.encryptMessage(rsaPublicKey, state.ecdsaKeys.private_key, response);
            fn(encryptedResponse);
          });

        });
      });

      state.socket.on('disconnect', function(){
        console.log('Socket disconnected');
      });
    });
  }

  async function sendMessageGladys(data) {
    
    if(state.socket === null) {
      throw new Error('Not connected to socket, cannot send message');
    }

    if(!state.gladysInstancePublicKey) {
      throw new Error('NO_INSTANCE_DETECTED');
    }

    if(!state.gladysInstance || !state.gladysInstance.id) {
      throw new Error('NO_INSTANCE_ID_DETECTED');
    }

    if(!state.ecdsaKeys) {
      throw new Error('NO_ECDSA_PRIVATE_KEY');
    }

    const encryptedMessage = await crypto.encryptMessage(state.gladysInstancePublicKey, state.ecdsaKeys.private_key, data);
    
    var payload = {
      instance_id: state.gladysInstance.id,
      encryptedMessage
    };
    
    return new Promise(function(resolve, reject) {
      state.socket.emit('message', payload, async function(response) {
        const decryptedMessage = await crypto.decryptMessage(state.rsaKeys.private_key, state.gladysInstanceEcdsaPublicKey, response);
        resolve(decryptedMessage);
      });
    });
  }

  async function sendRequest(method, path, body) {
    
    var message = {
      version: '1.0',
      type: 'gladys-api-call',
      options: {
        url: path,
        method: method
      }
    };

    if(method === 'GET' && body) {
      message.options.query = body;
    } else if(body) {
      message.options.data = body;
    }

    return sendMessageGladys(message);
  }

  var request = {
    get: (path, query) => sendRequest('GET', path, query), 
    post: (path, body) => sendRequest('POST', path, body), 
    patch: (path, body) => sendRequest('PATCH', path, body) 
  };

  return {
    signup,
    login,
    loginTwoFactor,
    configureTwoFactor,
    enableTwoFactor,
    confirmEmail,
    userConnect,
    getMyself,
    request,
    getUsersInAccount,
    inviteUser,
    loginInstance,
    createInstance,
    getAccessTokenInstance,
    instanceConnect,
    getUsersInstance
  };
};