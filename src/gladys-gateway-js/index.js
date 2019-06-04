const srpClient = require('secure-remote-password/client');
const axios = require('axios');
const autoBind = require('auto-bind');
const pbkdf2 = require('@ctrlpanel/pbkdf2');
const encodeUtf8 = require('encode-utf8');
const arrayBufferToHex = require('array-buffer-to-hex');
const hexToArrayBuffer = require('hex-to-array-buffer');
const io = require('socket.io-client');
const requestApi = require('./lib/request');

const Crypto = require('./lib/crypto');

const PBKDF2_HASH = 'SHA-256';
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;

const defaultLogger = {
  debug: console.log,
  info: console.log,
  warn: console.log,
  error: console.log,
};

class GladysGatewayJs {
  constructor({ cryptoLib, serverUrl, instance, logger = defaultLogger }) {
    this.crypto = Crypto({ cryptoLib });
    this.serverUrl = serverUrl;
    this.instance = instance;
    this.logger = logger;
    this.socket = null;
    this.refreshToken = null;
    this.rsaKeys = null;
    this.ecdsaKeys = null;
    this.gladysInstance = null;
    this.gladysInstancePublicKey = null;
    this.gladysInstanceEcdsaPublicKey = null;
    this.keysDictionnary = {};
    autoBind(this);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  async generateSrpAndKeys(rawEmail, rawPassword) {
    const email = rawEmail.trim().toLowerCase();
    const password = rawPassword.trim();

    // generate srp salt, privateKey and verifier
    const srpSalt = srpClient.generateSalt();
    const srpPrivateKey = arrayBufferToHex(
      await pbkdf2(
        encodeUtf8(`${email}:${password}`),
        hexToArrayBuffer(srpSalt),
        PBKDF2_ITERATIONS,
        PBKDF2_KEYLEN,
        PBKDF2_HASH,
      ),
    );
    const srpVerifier = srpClient.deriveVerifier(srpPrivateKey);

    // generate public/private key for the Gladys Gateway
    const { rsaKeys, ecdsaKeys, rsaPublicKeyJwk, ecdsaPublicKeyJwk } = await this.crypto.generateKeyPair();

    const rsaEncryptedPrivateKey = await this.crypto.encryptPrivateKey(password, rsaKeys.privateKey);
    const ecdsaEncryptedPrivateKey = await this.crypto.encryptPrivateKey(password, ecdsaKeys.privateKey);

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
      password,
    };
  }

  async signup(rawName, rawEmail, rawPassword, rawLanguage, invitationToken) {
    // first, we clean email and language
    const name = rawName.trim();
    const language = rawLanguage
      .trim()
      .substr(0, 2)
      .toLowerCase();

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
      email,
    } = await this.generateSrpAndKeys(rawEmail, rawPassword);

    this.rsaKeys = rsaKeys;
    this.ecdsaKeys = ecdsaKeys;

    const newUser = {
      name,
      email,
      srp_salt: srpSalt,
      srp_verifier: srpVerifier,
      language,
      rsa_public_key: JSON.stringify(rsaPublicKeyJwk),
      rsa_encrypted_private_key: JSON.stringify(rsaEncryptedPrivateKey),
      ecdsa_public_key: JSON.stringify(ecdsaPublicKeyJwk),
      ecdsa_encrypted_private_key: JSON.stringify(ecdsaEncryptedPrivateKey),
    };

    if (invitationToken) {
      newUser.token = invitationToken;
      return axios.post(`${this.serverUrl}/invitations/accept`, newUser);
    }
    return axios.post(`${this.serverUrl}/users/signup`, newUser);
  }

  async login(rawEmail, rawPassword) {
    const email = rawEmail.trim().toLowerCase();
    const password = rawPassword.trim();

    // first step, we generate the clientEphemeral
    const clientEphemeral = srpClient.generateEphemeral();

    // We ask the server for the salt
    const loginSaltResult = (await axios.post(`${this.serverUrl}/users/login-salt`, {
      email,
    })).data;

    // Then send our clientEphemeral public + email, and retrieve the server ephemeral public
    const serverEphemeralResult = (await axios.post(`${this.serverUrl}/users/login-generate-ephemeral`, {
      email,
      client_ephemeral_public: clientEphemeral.public,
    })).data;

    // We generate the key and wait
    const srpPrivateKey = arrayBufferToHex(
      await pbkdf2(
        encodeUtf8(`${email}:${password}`),
        hexToArrayBuffer(loginSaltResult.srp_salt),
        PBKDF2_ITERATIONS,
        PBKDF2_KEYLEN,
        PBKDF2_HASH,
      ),
    );
    const clientSession = srpClient.deriveSession(
      clientEphemeral.secret,
      serverEphemeralResult.server_ephemeral_public,
      loginSaltResult.srp_salt,
      email,
      srpPrivateKey,
    );

    // finally, we send the proof to the server
    const serverFinalLoginResult = (await axios.post(`${this.serverUrl}/users/login-finalize`, {
      login_session_key: serverEphemeralResult.login_session_key,
      client_session_proof: clientSession.proof,
    })).data;

    // we verify that the server have derived the correct strong session key
    srpClient.verifySession(clientEphemeral.public, clientSession, serverFinalLoginResult.server_session_proof);

    return serverFinalLoginResult;
  }

  async loginTwoFactor(accessToken, password, code, deviceName = 'Unknown') {
    const result = await axios.post(
      `${this.serverUrl}/users/login-two-factor`,
      { two_factor_code: code, device_name: deviceName },
      {
        headers: {
          authorization: accessToken,
        },
      },
    );

    const loginData = result.data;

    loginData.rsa_encrypted_private_key = JSON.parse(loginData.rsa_encrypted_private_key);
    loginData.ecdsa_encrypted_private_key = JSON.parse(loginData.ecdsa_encrypted_private_key);

    // We decrypt the encrypted RSA private key
    this.rsaKeys = {
      private_key: await this.crypto.decryptPrivateKey(
        password,
        loginData.rsa_encrypted_private_key.wrappedKey,
        'RSA-OAEP',
        loginData.rsa_encrypted_private_key.salt,
        loginData.rsa_encrypted_private_key.iv,
      ),
    };

    // We decrypt the encrypted ECDSA private key
    this.ecdsaKeys = {
      private_key: await this.crypto.decryptPrivateKeyJwk(
        password,
        loginData.ecdsa_encrypted_private_key.wrappedKey,
        'ECDSA',
        loginData.ecdsa_encrypted_private_key.salt,
        loginData.ecdsa_encrypted_private_key.iv,
      ),
    };

    this.accessToken = loginData.access_token;
    this.refreshToken = loginData.refresh_token;

    await this.getInstance();

    const rsaPublicKeyFingerprint = await this.crypto.generateFingerprint(loginData.rsa_public_key);
    const ecdsaPublicKeyFingerprint = await this.crypto.generateFingerprint(loginData.ecdsa_public_key);

    const serializedKeys = JSON.stringify({
      rsaPrivateKey: await this.crypto.exportKey(this.rsaKeys.private_key),
      ecdsaPrivateKey: await this.crypto.exportKey(this.ecdsaKeys.private_key),
    });

    return {
      gladysInstance: this.gladysInstance,
      gladysInstancePublicKey: this.gladysInstancePublicKey,
      rsaKeys: this.rsaKeys,
      ecdsaKeys: this.ecdsaKeys,
      refreshToken: loginData.refresh_token,
      accessToken: loginData.access_token,
      deviceId: loginData.device_id,
      rsaPublicKeyFingerprint,
      ecdsaPublicKeyFingerprint,
      serializedKeys,
    };
  }

  async loginInstance(twoFactorToken, twoFactorCode) {
    const loginData = (await axios.post(
      `${this.serverUrl}/users/login-two-factor`,
      { two_factor_code: twoFactorCode, device_name: 'Gladys Instance' },
      {
        headers: {
          authorization: twoFactorToken,
        },
      },
    )).data;

    this.accessToken = loginData.access_token;
    this.refreshToken = loginData.refreshToken;

    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
    };
  }

  async createInstance(name) {
    const {
      rsaKeys,
      ecdsaKeys,
      rsaPublicKeyJwk,
      ecdsaPublicKeyJwk,
      rsaPrivateKeyJwk,
      ecdsaPrivateKeyJwk,
    } = await this.crypto.generateKeyPair();

    const instance = {
      name,
      rsa_public_key: JSON.stringify(rsaPublicKeyJwk),
      ecdsa_public_key: JSON.stringify(ecdsaPublicKeyJwk),
    };

    const createdInstance = (await axios.post(`${this.serverUrl}/instances`, instance, {
      headers: {
        authorization: this.accessToken,
      },
    })).data;

    this.gladysInstance = createdInstance;
    this.gladysInstanceRsaKeys = rsaKeys;
    this.gladysInstanceEcdsaKeys = ecdsaKeys;

    return {
      instance: createdInstance,
      rsaPrivateKeyJwk,
      ecdsaPrivateKeyJwk,
      rsaPublicKeyJwk,
      ecdsaPublicKeyJwk,
    };
  }

  async configureTwoFactor(accessToken) {
    return (await axios.post(
      `${this.serverUrl}/users/two-factor-configure`,
      {},
      {
        headers: {
          authorization: accessToken,
        },
      },
    )).data;
  }

  async enableTwoFactor(accessToken, twoFactorCode) {
    return (await axios.post(
      `${this.serverUrl}/users/two-factor-enable`,
      { two_factor_code: twoFactorCode },
      {
        headers: {
          authorization: accessToken,
        },
      },
    )).data;
  }

  async confirmEmail(token) {
    return (await axios.post(`${this.serverUrl}/users/verify`, {
      email_confirmation_token: token,
    })).data;
  }

  async getAccessToken(refreshToken) {
    return (await axios.get(`${this.serverUrl}/users/access-token`, {
      headers: {
        authorization: refreshToken,
      },
    })).data.access_token;
  }

  async getAccessTokenInstance(refreshToken) {
    return (await axios.get(`${this.serverUrl}/instances/access-token`, {
      headers: {
        authorization: refreshToken,
      },
    })).data.access_token;
  }

  /**
   * Frontend API
   */

  async getMyself() {
    return requestApi.get(`${this.serverUrl}/users/me`, this);
  }

  async updateMyself(rawName, rawEmail, rawPassword, rawLanguage) {
    const email = rawEmail.trim().toLowerCase();
    const name = rawName.trim();
    const language = rawLanguage
      .trim()
      .substr(0, 2)
      .toLowerCase();

    const newUser = {
      name,
      email,
      language,
    };

    // if a password is provided
    if (rawPassword) {
      const password = rawPassword.trim();

      // generate srp salt, privateKey and verifier
      const srpSalt = srpClient.generateSalt();
      const srpPrivateKey = arrayBufferToHex(
        await pbkdf2(
          encodeUtf8(`${email}:${password}`),
          hexToArrayBuffer(srpSalt),
          PBKDF2_ITERATIONS,
          PBKDF2_KEYLEN,
          PBKDF2_HASH,
        ),
      );
      const srpVerifier = srpClient.deriveVerifier(srpPrivateKey);

      // re-encrypte private keys
      const rsaEncryptedPrivateKey = await this.crypto.encryptPrivateKey(password, this.rsaKeys.private_key);
      const ecdsaEncryptedPrivateKey = await this.crypto.encryptPrivateKey(password, this.ecdsaKeys.private_key);

      newUser.srp_salt = srpSalt;
      newUser.srp_verifier = srpVerifier;
      newUser.rsa_encrypted_private_key = JSON.stringify(rsaEncryptedPrivateKey);
      newUser.ecdsa_encrypted_private_key = JSON.stringify(ecdsaEncryptedPrivateKey);
    }

    return requestApi.patch(`${this.serverUrl}/users/me`, newUser, this);
  }

  async updateUserIdInGladys(userIdInGladys) {
    return requestApi.patch(
      `${this.serverUrl}/users/me`,
      {
        gladys_user_id: userIdInGladys,
      },
      this,
    );
  }

  async forgotPassword(email) {
    return requestApi.post(`${this.serverUrl}/users/forgot-password`, { email }, this);
  }

  async getResetPasswordEmail(resetToken) {
    return requestApi.get(`${this.serverUrl}/users/reset-password/${resetToken}`, this);
  }

  async resetPassword(rawEmail, rawPassword, resetToken, twoFactorCode) {
    // we generate a new srp verifier and new keys
    const {
      srpSalt,
      srpVerifier,
      rsaPublicKeyJwk,
      ecdsaPublicKeyJwk,
      rsaEncryptedPrivateKey,
      ecdsaEncryptedPrivateKey,
    } = await this.generateSrpAndKeys(rawEmail, rawPassword);

    const data = {
      token: resetToken,
      two_factor_code: twoFactorCode,
      srp_salt: srpSalt,
      srp_verifier: srpVerifier,
      rsa_public_key: JSON.stringify(rsaPublicKeyJwk),
      rsa_encrypted_private_key: JSON.stringify(rsaEncryptedPrivateKey),
      ecdsa_public_key: JSON.stringify(ecdsaPublicKeyJwk),
      ecdsa_encrypted_private_key: JSON.stringify(ecdsaEncryptedPrivateKey),
    };

    return requestApi.post(`${this.serverUrl}/users/reset-password`, data, this);
  }

  async getUsersInAccount() {
    return requestApi.get(`${this.serverUrl}/accounts/users`, this);
  }

  async getInvoices() {
    return requestApi.get(`${this.serverUrl}/accounts/invoices`, this);
  }

  async getDevices() {
    return requestApi.get(`${this.serverUrl}/users/me/devices`, this);
  }

  async revokeDevice(deviceId) {
    return requestApi.post(`${this.serverUrl}/devices/${deviceId}/revoke`, {}, this);
  }

  async inviteUser(email, role) {
    return requestApi.post(`${this.serverUrl}/invitations`, { email, role }, this);
  }

  async getInvitation(token) {
    return requestApi.get(`${this.serverUrl}/invitations/${token}`, this);
  }

  async revokeInvitation(invitationId) {
    return requestApi.post(`${this.serverUrl}/invitations/${invitationId}/revoke`, {}, this);
  }

  async revokeUser(userId) {
    return requestApi.post(`${this.serverUrl}/accounts/users/${userId}/revoke`, {}, this);
  }

  async getSetupState() {
    return requestApi.get(`${this.serverUrl}/users/setup`, this);
  }

  async subcribeMonthlyPlan(sourceId) {
    return requestApi.post(`${this.serverUrl}/accounts/subscribe`, { stripe_source_id: sourceId }, this);
  }

  async subcribeMonthlyPlanWithoutAccount(email, language, sourceId) {
    return requestApi.post(
      `${this.serverUrl}/accounts/subscribe/new`,
      { email, language, stripe_source_id: sourceId },
      this,
    );
  }

  async reSubcribeMonthlyPlan() {
    return requestApi.post(`${this.serverUrl}/accounts/resubscribe`, {}, this);
  }

  async updateCard(sourceId) {
    return requestApi.patch(`${this.serverUrl}/accounts/source`, { stripe_source_id: sourceId }, this);
  }

  async getCard() {
    return requestApi.get(`${this.serverUrl}/accounts/source`, this);
  }

  async cancelMonthlyPlan() {
    return requestApi.post(`${this.serverUrl}/accounts/cancel`, {}, this);
  }

  async createApiKey(name) {
    return requestApi.post(`${this.serverUrl}/open-api-keys`, { name }, this);
  }

  async getApiKeys() {
    return requestApi.get(`${this.serverUrl}/open-api-keys`, this);
  }

  async updateApiKeyName(id, name) {
    return requestApi.post(`${this.serverUrl}/open-api-keys/${id}`, { name }, this);
  }

  async revokeApiKey(id) {
    return requestApi.delete(`${this.serverUrl}/open-api-keys/${id}`, this);
  }

  async getInstance() {
    const instances = await requestApi.get(`${this.serverUrl}/instances`, this);

    let instance = null;
    let i = 0;

    while (i < instances.length && instance === null) {
      if (instances[i].primary_instance === true) {
        instance = instances[i];
      }
      i += 1;
    }

    if (instance) {
      this.gladysInstance = instance;

      this.gladysInstancePublicKey = await this.crypto.importKey(JSON.parse(instance.rsa_public_key), 'RSA-OEAP', true);
      this.gladysInstanceEcdsaPublicKey = await this.crypto.importKey(
        JSON.parse(instance.ecdsa_public_key),
        'ECDSA',
        true,
      );
    }

    return instance;
  }

  async userConnect(refreshToken, serializedKeys, callback) {
    if (this.socket) {
      return Promise.resolve({ authenticated: true });
    }

    // deserialize keys
    const keys = JSON.parse(serializedKeys);

    const ecdsaKeys = {
      private_key: await this.crypto.importKey(keys.ecdsaPrivateKey, 'ECDSA', false),
    };

    const rsaKeys = {
      private_key: await this.crypto.importKey(keys.rsaPrivateKey, 'RSA-OEAP', false),
    };

    this.isInstance = false;

    this.refreshToken = refreshToken;
    this.rsaKeys = rsaKeys;
    this.ecdsaKeys = ecdsaKeys;

    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl);

      this.socket.on('connect', async () => {
        try {
          // we are connected, so we get a new access token
          this.accessToken = await this.getAccessToken(refreshToken);
        } catch (err) {
          // refresh token is not good anymore
          if (err && err.response && err.response.data && err.response.data.status === 401) {
            reject(new Error('invalid-refresh-token'));
          }

          throw err;
        }

        // we get the instance
        await this.getInstance();

        this.socket.emit('user-authentication', { access_token: this.accessToken }, async (res) => {
          if (res.authenticated) {
            this.logger.info('Gladys Gateway, connected in websocket');
            resolve();
          } else {
            reject(new Error('invalid-access-token'));
          }
        });
      });

      this.socket.on('hello', (instance) => {
        if (callback) {
          callback('hello', instance);
        }
      });

      this.socket.on('message', async (message) => {
        const decryptedMessage = await this.crypto.decryptMessage(
          this.rsaKeys.private_key,
          this.gladysInstanceEcdsaPublicKey,
          message.encryptedMessage,
        );
        if (callback) {
          callback('message', decryptedMessage);
        }
      });

      this.socket.on('disconnect', async (reason) => {
        if (reason === 'io server disconnect') {
          // the disconnection was initiated by the server, you need to reconnect manually
          this.logger.warn('Socket disconnected by the server. Trying to reconnect...');
          this.socket.connect();
        } else {
          this.logger.warn('Socket disconnected client side. Trying to reconnect...');
        }
      });
    });
  }

  /**
   * Admin API
   */

  async adminGetAccounts() {
    return requestApi.get(`${this.serverUrl}/admin/accounts`, this);
  }

  async adminResendConfirmationEmail(accountId, language) {
    return requestApi.post(`${this.serverUrl}/admin/accounts/${accountId}/resend`, { language }, this);
  }

  /**
   * Instance API
   */

  async getUsersInstance() {
    return requestApi.get(`${this.serverUrl}/instances/users`, this);
  }

  async generateFingerprint(key) {
    return this.crypto.generateFingerprint(key);
  }

  async refreshUsersList() {
    // first, we get all users in instance
    const users = await this.getUsersInstance();

    users.forEach(async (user) => {
      // if the user is not in cache
      if (!this.keysDictionnary[user.id]) {
        // we cache the keys for later use
        this.keysDictionnary[user.id] = {
          id: user.id,
          connected: user.connected,
          ecdsaPublicKey: await this.crypto.importKey(JSON.parse(user.ecdsa_public_key), 'ECDSA', true),
          rsaPublicKey: await this.crypto.importKey(JSON.parse(user.rsa_public_key), 'RSA-OEAP', true),
          ecdsaPublicKeyRaw: user.ecdsa_public_key,
          rsaPublicKeyRaw: user.rsa_public_key,
        };
      } else {
        // if the user is already in cache, we just save his connected status
        this.keysDictionnary[user.id].connected = user.connected;
      }
    });
  }

  async instanceConnect(refreshToken, rsaPrivateKeyJwk, ecdsaPrivateKeyJwk, callbackMessage) {
    // clean current this
    this.socket = null;
    this.accessToken = null;

    this.refreshToken = refreshToken;
    this.isInstance = true;

    // We import the RSA private key
    this.rsaKeys = {
      private_key: await this.crypto.importKey(rsaPrivateKeyJwk, 'RSA-OEAP'),
    };

    // We import the ECDSA private key
    this.ecdsaKeys = {
      private_key: await this.crypto.importKey(ecdsaPrivateKeyJwk, 'ECDSA'),
    };

    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl);

      this.socket.on('connect', async () => {
        // we are connected, we get an access token
        this.accessToken = await this.getAccessTokenInstance(this.refreshToken);

        // refresh user list
        await this.refreshUsersList();

        this.socket.emit('instance-authentication', { access_token: this.accessToken }, async (res) => {
          if (res.authenticated) {
            this.logger.info('Gladys Gateway: connected in websockets');
            resolve();
          } else {
            reject();
          }
        });

        // Open API message
        // By definition, those messages cannot be E2E encrypted
        // because the recipient is a third-party
        this.socket.on('open-api-message', async (data, fn) => {
          callbackMessage(data, data, async (response) => {
            fn(response);
          });
        });

        this.socket.on('message', async (data, fn) => {
          let ecdsaPublicKey = null;
          let rsaPublicKey = null;

          // if we don't have the key in RAM, we refresh the user list
          if (!this.keysDictionnary[data.sender_id]) {
            await this.refreshUsersList();
          }

          if (this.keysDictionnary[data.sender_id]) {
            ecdsaPublicKey = this.keysDictionnary[data.sender_id].ecdsaPublicKey; // eslint-disable-line
            rsaPublicKey = this.keysDictionnary[data.sender_id].rsaPublicKey; // eslint-disable-line
            data.ecdsaPublicKeyRaw = this.keysDictionnary[data.sender_id].ecdsaPublicKeyRaw;
            data.rsaPublicKeyRaw = this.keysDictionnary[data.sender_id].rsaPublicKeyRaw;
          }

          if (ecdsaPublicKey == null || rsaPublicKey == null) {
            throw new Error('User not found');
          }

          const decryptedMessage = await this.crypto.decryptMessage(
            this.rsaKeys.private_key,
            ecdsaPublicKey,
            data.encryptedMessage,
          );

          callbackMessage(decryptedMessage, data, async (response) => {
            const encryptedResponse = await this.crypto.encryptMessage(
              rsaPublicKey,
              this.ecdsaKeys.private_key,
              response,
            );
            fn(encryptedResponse);
          });
        });
      });

      // it means one user has updated his keys, so clearing key cache
      this.socket.on('clear-key-cache', async () => {
        this.logger.info('gladys-gateway-js: Clearing key cache');
        this.keysDictionnary = {};
        await this.refreshUsersList();
      });

      this.socket.on('disconnect', async (reason) => {
        if (reason === 'io server disconnect') {
          // the disconnection was initiated by the server, you need to reconnect manually
          this.logger.warn('Socket disconnected by the server. Trying to reconnect...');
          this.socket.connect();
        } else {
          this.logger.warn('Socket disconnected client side. Trying to reconnect...');
        }
      });
    });
  }

  async sendMessageAllUsers(data) {
    if (this.socket === null) {
      throw new Error('Not connected to socket, cannot send message');
    }

    await this.refreshUsersList();

    const allUsers = Object.keys(this.keysDictionnary);

    const sendMessage = async (userId) => {
      const encryptedMessage = await this.crypto.encryptMessage(
        this.keysDictionnary[userId].rsaPublicKey,
        this.ecdsaKeys.private_key,
        data,
      );
      const payload = {
        user_id: userId,
        encryptedMessage,
      };

      this.socket.emit('message', payload);
    };

    allUsers.forEach((userId) => {
      // we send the message only if the user is connected
      if (this.keysDictionnary[userId].connected) {
        sendMessage(userId);
      }
    });
  }

  async newEventInstance(event, data) {
    return this.sendMessageAllUsers({
      version: '1.0',
      type: 'gladys-event',
      event,
      data,
    });
  }

  async calculateLatency() {
    if (this.socket === null) {
      throw new Error('Not connected to socket, cannot send message');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('latency', Date.now(), (startTime) => {
        const latency = Date.now() - startTime;
        resolve(latency);
      });
    });
  }

  async sendMessageGladys(data) {
    if (this.socket === null) {
      throw new Error('Not connected to socket, cannot send message');
    }

    if (!this.gladysInstancePublicKey) {
      throw new Error('NO_INSTANCE_DETECTED');
    }

    if (!this.gladysInstance || !this.gladysInstance.id) {
      throw new Error('NO_INSTANCE_ID_DETECTED');
    }

    if (!this.ecdsaKeys) {
      throw new Error('NO_ECDSA_PRIVATE_KEY');
    }

    const encryptedMessage = await this.crypto.encryptMessage(
      this.gladysInstancePublicKey,
      this.ecdsaKeys.private_key,
      data,
    );

    const payload = {
      instance_id: this.gladysInstance.id,
      encryptedMessage,
    };

    return new Promise((resolve, reject) => {
      this.socket.emit('message', payload, async (response) => {
        if (response && response.status && response.error_code) {
          return reject(response);
        }
        const decryptedMessage = await this.crypto.decryptMessage(
          this.rsaKeys.private_key,
          this.gladysInstanceEcdsaPublicKey,
          response,
        );

        if (decryptedMessage && decryptedMessage.status && decryptedMessage.error_code) {
          return reject(decryptedMessage);
        }
        return resolve(decryptedMessage);
      });
    });
  }

  async sendRequest(method, path, body) {
    const message = {
      version: '1.0',
      type: 'gladys-api-call',
      options: {
        url: path,
        method,
      },
    };

    if (method === 'GET' && body) {
      message.options.query = body;
    } else if (body) {
      message.options.data = body;
    }

    return this.sendMessageGladys(message);
  }

  async sendRequestGet(path, query) {
    return this.sendRequest('GET', path, query);
  }

  async sendRequestPost(path, query) {
    return this.sendRequest('POST', path, query);
  }

  async sendRequestPatch(path, query) {
    return this.sendRequest('PATCH', path, query);
  }

  async uploadBackup(form) {
    return requestApi.upload(`${this.serverUrl}/backups`, form, this);
  }

  async getBackups() {
    return requestApi.get(`${this.serverUrl}/backups`, this);
  }

  async downloadBackup(backupUrl, writeStream) {
    if (!this.instance) {
      throw new Error('Method only for instance');
    }
    const response = await axios({
      url: backupUrl,
      method: 'GET',
      responseType: 'stream',
    });

    response.data.pipe(writeStream);

    return new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  }

  async getLatestGladysVersion(currentGladysVersion, params) {
    if (!this.instance) {
      throw new Error('Method only for instance');
    }
    return axios({
      method: 'GET',
      query: params,
      headers: {
        'user-agent': `Gladys/${currentGladysVersion}`,
      },
    });
  }
}

module.exports = GladysGatewayJs;
