const srpClient = require('secure-remote-password/client');
const axios = require('axios');
const pbkdf2 = require('@ctrlpanel/pbkdf2');
const encodeUtf8 = require('encode-utf8');
const arrayBufferToHex = require('array-buffer-to-hex');
const hexToArrayBuffer = require('hex-to-array-buffer');
const io = require('socket.io-client');
const requestApi = require('./lib/request');
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;

module.exports = function ({ cryptoLib, serverUrl, logger }) {

  const crypto = require('./lib/crypto')({ cryptoLib });

  if(!logger) {
    logger = {
      debug: console.log,
      info: console.log,
      warn: console.log,
      error: console.log
    };
  }

  const state = {
    serverUrl,
    socket: null,
    refreshToken: null,
    rsaKeys: null,
    ecdsaKeys: null,
    gladysInstance: null,
    gladysInstancePublicKey: null,
    gladysInstanceEcdsaPublicKey: null,
    keysDictionnary: {}
  };

  async function generateSrpAndKeys(rawEmail, rawPassword) {
    
    var email = rawEmail.trim().toLowerCase();
    var password = rawPassword.trim();

    // generate srp salt, privateKey and verifier
    const srpSalt = srpClient.generateSalt();
    const srpPrivateKey = arrayBufferToHex(await pbkdf2(encodeUtf8(`${email}:${password}`), hexToArrayBuffer(srpSalt), PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_HASH));
    const srpVerifier = srpClient.deriveVerifier(srpPrivateKey);

    // generate public/private key for the Gladys Gateway
    const { rsaKeys, ecdsaKeys, rsaPublicKeyJwk, ecdsaPublicKeyJwk } = await crypto.generateKeyPair();

    const rsaEncryptedPrivateKey = await crypto.encryptPrivateKey(password, rsaKeys.privateKey);
    const ecdsaEncryptedPrivateKey = await crypto.encryptPrivateKey(password, ecdsaKeys.privateKey);

    return {
      srpSalt,
      srpPrivateKey,
      srpVerifier,
      rsaKeys, 
      ecdsaKeys, 
      rsaPublicKeyJwk, 
      ecdsaPublicKeyJwk,
      rsaEncryptedPrivateKey,
      ecdsaEncryptedPrivateKey,
      email,
      password
    };
  }

  async function signup(rawName, rawEmail, rawPassword, rawLanguage, invitationToken) {
    
    // first, we clean email and language
    var name = rawName.trim();
    var language = rawLanguage.trim().substr(0, 2).toLowerCase();

    // we generate the srp verifier and keys
    const {
      srpSalt,
      srpVerifier,
      rsaKeys, 
      ecdsaKeys, 
      rsaPublicKeyJwk, 
      ecdsaPublicKeyJwk,
      rsaEncryptedPrivateKey,
      ecdsaEncryptedPrivateKey,
      email
    } = await generateSrpAndKeys(rawEmail, rawPassword);

  
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

    if(invitationToken) {
      newUser.token = invitationToken;
      return axios.post(serverUrl + '/invitations/accept', newUser);
    } else {
      return axios.post(serverUrl + '/users/signup', newUser);
    }
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

  async function loginTwoFactor(accessToken, password, code, deviceName) {

    deviceName = deviceName || 'Unknown';

    const result = (await axios.post(serverUrl + '/users/login-two-factor', { two_factor_code: code, device_name: deviceName }, {
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

    state.accessToken = loginData.access_token;
    state.refreshToken = loginData.refresh_token;

    await getInstance();

    return {
      gladysInstance: state.gladysInstance,
      gladysInstancePublicKey: state.gladysInstancePublicKey,
      rsaKeys: state.rsaKeys,
      ecdsaKeys: state.ecdsaKeys,
      refreshToken: loginData.refresh_token,
      accessToken: loginData.access_token,
      deviceId: loginData.device_id
    };
  }

  async function loginInstance(twoFactorToken, twoFactorCode) {
    
    const loginData = (await axios.post(serverUrl + '/users/login-two-factor', { two_factor_code: twoFactorCode, device_name: 'Gladys Instance' }, {
      headers: {
        authorization: twoFactorToken
      }
    })).data;

    state.accessToken = loginData.access_token;
    state.refreshToken = loginData.refreshToken;

    return {
      accessToken: state.accessToken,
      refreshToken: state.refreshToken
    };
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
      ecdsaPrivateKeyJwk,
      rsaPublicKeyJwk,
      ecdsaPublicKeyJwk
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

  /**
   * Frontend API
   */

  async function getMyself() {
    return requestApi.get(serverUrl + '/users/me', state);
  }

  async function updateMyself(rawName, rawEmail, rawPassword, rawLanguage) {
    
    var email = rawEmail.trim().toLowerCase();
    var name = rawName.trim();
    var language = rawLanguage.trim().substr(0, 2).toLowerCase();

    var newUser = {
      name,
      email,
      language
    };

    // if a password is provided
    if(rawPassword) {
      var password = rawPassword.trim();

      // generate srp salt, privateKey and verifier
      const srpSalt = srpClient.generateSalt();
      const srpPrivateKey = arrayBufferToHex(await pbkdf2(encodeUtf8(`${email}:${password}`), hexToArrayBuffer(srpSalt), PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_HASH));
      const srpVerifier = srpClient.deriveVerifier(srpPrivateKey);

      // re-encrypte private keys
      const rsaEncryptedPrivateKey = await crypto.encryptPrivateKey(password, state.rsaKeys.private_key);
      const ecdsaEncryptedPrivateKey = await crypto.encryptPrivateKey(password, state.ecdsaKeys.private_key);

      newUser.srp_salt = srpSalt;
      newUser.srp_verifier = srpVerifier;
      newUser.rsa_encrypted_private_key = JSON.stringify(rsaEncryptedPrivateKey);
      newUser.ecdsa_encrypted_private_key = JSON.stringify(ecdsaEncryptedPrivateKey);
    }

    return requestApi.patch(serverUrl + '/users/me', newUser, state);
  }

  async function updateUserIdInGladys(userIdInGladys) {
    return requestApi.patch(serverUrl + '/users/me', {
      gladys_user_id: userIdInGladys
    }, state);
  }

  async function forgotPassword(email) {
    return requestApi.post(serverUrl + '/users/forgot-password', { email }, state);
  }

  async function getResetPasswordEmail(resetToken){
    return requestApi.get(serverUrl + '/users/reset-password/' + resetToken, state);
  }
 
  async function resetPassword(rawEmail, rawPassword, resetToken, twoFactorCode) {
    
    // we generate a new srp verifier and new keys
    const {
      srpSalt,
      srpVerifier,
      rsaPublicKeyJwk, 
      ecdsaPublicKeyJwk,
      rsaEncryptedPrivateKey,
      ecdsaEncryptedPrivateKey
    } = await generateSrpAndKeys(rawEmail, rawPassword);

    var data = {
      token: resetToken,
      two_factor_code: twoFactorCode,
      srp_salt: srpSalt,
      srp_verifier: srpVerifier,
      rsa_public_key: JSON.stringify(rsaPublicKeyJwk),
      rsa_encrypted_private_key: JSON.stringify(rsaEncryptedPrivateKey),
      ecdsa_public_key: JSON.stringify(ecdsaPublicKeyJwk),
      ecdsa_encrypted_private_key: JSON.stringify(ecdsaEncryptedPrivateKey)
    };

    return requestApi.post(serverUrl + '/users/reset-password', data, state);
  }

  async function getUsersInAccount() {
    return requestApi.get(serverUrl + '/accounts/users', state);
  }

  async function getInvoices() {
    return requestApi.get(serverUrl + '/accounts/invoices', state);
  }

  async function getDevices() {
    return requestApi.get(serverUrl + '/users/me/devices', state);
  }

  async function revokeDevice(deviceId) {
    return requestApi.post(serverUrl + '/devices/' + deviceId + '/revoke', {}, state);
  }

  async function inviteUser(email, role) {
    return requestApi.post(serverUrl + '/invitations', { email, role },  state);
  }

  async function getInvitation(token) {
    return requestApi.get(serverUrl + '/invitations/' + token, state);
  }

  async function revokeInvitation(invitationId) {
    return requestApi.post(serverUrl + '/invitations/' + invitationId + '/revoke', {}, state);
  }

  async function revokeUser(userId) {
    return requestApi.post(serverUrl + '/accounts/users/' + userId + '/revoke', {}, state);
  }

  async function getSetupState() {
    return requestApi.get(serverUrl + '/users/setup', state);
  }

  async function subcribeMonthlyPlan(sourceId) {
    return requestApi.post(serverUrl + '/accounts/subscribe', { stripe_source_id: sourceId }, state);
  }

  async function reSubcribeMonthlyPlan() {
    return requestApi.post(serverUrl + '/accounts/resubscribe', {}, state);
  }

  async function updateCard(sourceId) {
    return requestApi.patch(serverUrl + '/accounts/source', { stripe_source_id: sourceId }, state);
  }

  async function getCard() {
    return requestApi.get(serverUrl + '/accounts/source', state);
  }

  async function cancelMonthlyPlan() {
    return requestApi.post(serverUrl + '/accounts/cancel', {}, state);
  }

  async function getInstance() {
    let instances = await requestApi.get(serverUrl + '/instances', state);

    let instance = null;
    let i = 0;

    while(i < instances.length && instance === null) {
      if (instances[i].primary_instance === true) {
        instance = instances[i];
      }
      i++;
    }

    if (instance) {
      state.gladysInstance = instance;

      state.gladysInstancePublicKey = await crypto.importKey(JSON.parse(instance.rsa_public_key), 'RSA-OEAP', true);
      state.gladysInstanceEcdsaPublicKey = await crypto.importKey(JSON.parse(instance.ecdsa_public_key), 'ECDSA', true);
    }
    
    return instance;
  }

  async function userConnect(refreshToken, rsaKeys, ecdsaKeys, callback) {

    if(state.socket) {
      return Promise.resolve({ authenticated: true });
    }

    state.isInstance = false;
    
    state.refreshToken = refreshToken;
    state.rsaKeys = rsaKeys;
    state.ecdsaKeys = ecdsaKeys;

    return new Promise(function(resolve, reject) {
      state.socket = io(serverUrl);

      state.socket.on('connect', async () => {

        // we are connected, so we get a new access token
        state.accessToken = await getAccessToken(refreshToken);

        // we get the instance
        await getInstance();

        state.socket.emit('user-authentication', { access_token: state.accessToken }, async function(res) {
          if(res.authenticated) {
            logger.info('Gladys Gateway, connected in websocket');
            resolve();
          } else {
            reject();
          }
        });
      });

      state.socket.on('hello', (instance) => {
        if(callback) { 
          callback('hello', instance);
        }
      });

      state.socket.on('message', async (message) => {
        var decryptedMessage = await crypto.decryptMessage(state.rsaKeys.private_key, state.gladysInstanceEcdsaPublicKey, message.encryptedMessage);
        if(callback) {
          callback('message', decryptedMessage);
        }
      });

      state.socket.on('disconnect', async function(){
        console.log('Socket disconnected, trying to reconnect....');
      });
    });
  }

  /**
   * Instance API
   */

  async function getUsersInstance() {
    return requestApi.get(serverUrl + '/instances/users', state);
  }

  async function refreshUsersList() {

    // first, we get all users in instance
    var users = await getUsersInstance();
  
    users.forEach(async (user) => {

      // if the user is not in cache
      if(!state.keysDictionnary[user.id]) {
        
        // we cache the keys for later use
        state.keysDictionnary[user.id] = {
          id: user.id,
          connected: user.connected,
          ecdsaPublicKey: await crypto.importKey(JSON.parse(user.ecdsa_public_key), 'ECDSA', true),
          rsaPublicKey: await crypto.importKey(JSON.parse(user.rsa_public_key), 'RSA-OEAP', true),
          ecdsaPublicKeyRaw: user.ecdsa_public_key,
          rsaPublicKeyRaw: user.rsa_public_key
        };
      } 
      
      // if the user is already in cache, we just save his connected status
      else {
        state.keysDictionnary[user.id].connected = user.connected;
      }
    });
  }

  async function instanceConnect(refreshToken, rsaPrivateKeyJwk, ecdsaPrivateKeyJwk, callbackMessage) {

    if(state.socket) {
      return Promise.resolve({ authenticated: true });
    }
    
    state.refreshToken = refreshToken;
    state.isInstance = true;

    // We import the RSA private key
    state.rsaKeys = {
      private_key: await crypto.importKey(rsaPrivateKeyJwk, 'RSA-OEAP')
    };

    // We import the ECDSA private key
    state.ecdsaKeys = {
      private_key: await crypto.importKey(ecdsaPrivateKeyJwk, 'ECDSA')
    };

    return new Promise(function(resolve, reject) {
      state.socket = io(serverUrl);

      state.socket.on('connect', async () => {
        
        // we are connected, we get an access token
        state.accessToken = await getAccessTokenInstance(state.refreshToken);
        
        // refresh user list
        await refreshUsersList();

        state.socket.emit('instance-authentication', { access_token: state.accessToken }, async function(res) {
          if(res.authenticated) {
            logger.info('Gladys Gateway: connected in websockets');
            resolve();
          } else {
            reject();
          }
        });

        state.socket.on('message', async function(data, fn) {

          var ecdsaPublicKey = null;
          var rsaPublicKey = null;
          
          // if we don't have the key in RAM, we refresh the user list
          if (!state.keysDictionnary[data.sender_id]) {
            await refreshUsersList();
          }

          if (state.keysDictionnary[data.sender_id]) {
            ecdsaPublicKey = state.keysDictionnary[data.sender_id].ecdsaPublicKey;
            rsaPublicKey = state.keysDictionnary[data.sender_id].rsaPublicKey;
            data.ecdsaPublicKeyRaw = state.keysDictionnary[data.sender_id].ecdsaPublicKeyRaw;
            data.rsaPublicKeyRaw = state.keysDictionnary[data.sender_id].rsaPublicKeyRaw;
          }

          if(ecdsaPublicKey == null || rsaPublicKey == null) {
            throw new Error('User not found');
          }

          var decryptedMessage = await crypto.decryptMessage(state.rsaKeys.private_key, ecdsaPublicKey, data.encryptedMessage);
          
          callbackMessage(decryptedMessage, data, async function(response) {
            var encryptedResponse = await crypto.encryptMessage(rsaPublicKey, state.ecdsaKeys.private_key, response);
            fn(encryptedResponse);
          });

        });
      });

      // it means one user has updated his keys, so clearing key cache
      state.socket.on('clear-key-cache', async function(){
        logger.info('gladys-gateway-js: Clearing key cache');
        state.keysDictionnary = {};
        await refreshUsersList();
      });

      state.socket.on('disconnect', async function(){
        logger.warn('Socket disconnected. Trying to reconnect....');
      });
    });
  }

  async function sendMessageAllUsers(data) {
    
    if(state.socket === null) {
      throw new Error('Not connected to socket, cannot send message');
    }

    await refreshUsersList();

    for(var userId in state.keysDictionnary) {
      
      // we send the message only if the user is connected
      if(state.keysDictionnary[userId].connected) {
        const encryptedMessage = await crypto.encryptMessage(state.keysDictionnary[userId].rsaPublicKey,  state.ecdsaKeys.private_key, data);
        
        let payload = {
          user_id: userId,
          encryptedMessage
        };

        state.socket.emit('message', payload);
      }
    }
  }

  async function newEventInstance(event, data) {
    return sendMessageAllUsers({
      version: '1.0',
      type: 'gladys-event',
      event, 
      data
    });
  }

  async function calculateLatency() {
    
    if(state.socket === null) {
      throw new Error('Not connected to socket, cannot send message');
    }

    return new Promise((resolve, reject) => {
      state.socket.emit('latency', Date.now(), function(startTime) {
        var latency = Date.now() - startTime;
        resolve(latency);
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
        if(response && response.status && response.error_code) {
          return reject(response);
        } else {
          const decryptedMessage = await crypto.decryptMessage(state.rsaKeys.private_key, state.gladysInstanceEcdsaPublicKey, response);
          return resolve(decryptedMessage);
        }
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
    getDevices,
    revokeDevice,
    updateMyself,
    updateUserIdInGladys,
    getSetupState,
    request,
    getUsersInAccount,
    getInvoices,
    forgotPassword,
    resetPassword,
    getResetPasswordEmail,
    getInstance,
    inviteUser,
    revokeUser,
    getInvitation,
    revokeInvitation,
    loginInstance,
    createInstance,
    getAccessTokenInstance,
    instanceConnect,
    getUsersInstance,
    calculateLatency,
    subcribeMonthlyPlan,
    reSubcribeMonthlyPlan,
    updateCard,
    getCard,
    cancelMonthlyPlan,
    sendMessageAllUsers,
    newEventInstance
  };
};