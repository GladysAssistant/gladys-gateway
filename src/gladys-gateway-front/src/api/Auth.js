import config from '../../config';
import GladysGatewayClient from '@gladysassistant/gladys-gateway-js';
import keyValStore from './keyValStore';
import { route } from 'preact-router';

const client = new GladysGatewayClient({ serverUrl: config.serverUrl, cryptoLib: window.crypto });

function redirectWrapper(func) {
  return function(url, params) {
    return func(url, params).catch(err => {
      if (err.status === 401) {
        route('/login');
      } else {
        return Promise.reject(err);
      }
    });
  };
}

const Auth = {
  login: data => client.login(data.email, data.password),
  loginTwoFactor: client.loginTwoFactor,
  signup: client.signup,
  confirmEmail: token => client.confirmEmail(token),
  configureTwoFactor: accessToken => client.configureTwoFactor(accessToken),
  enableTwoFactor: (accessToken, twoFactorCode) =>
    client.enableTwoFactor(accessToken, twoFactorCode),
  getMySelf: redirectWrapper(client.getMyself),
  updateMyself: client.updateMyself,
  forgotPassword: client.forgotPassword,
  resetPassword: client.resetPassword,
  getResetPasswordEmail: client.getResetPasswordEmail,
  updateUserIdInGladys: client.updateUserIdInGladys,
  getDevices: client.getDevices,
  revokeDevice: client.revokeDevice,
  revokeUser: client.revokeUser,
  revokeInvitation: client.revokeInvitation,
  revokeCurrentDevice: async () => {
    let deviceId = await keyValStore.get('device_id');
    await client.revokeDevice(deviceId);
  },
  isAccoutSetup: async () => {
    const setupState = await client.getSetupState();
    return (
      setupState.billing_setup &&
      setupState.gladys_instance_setup &&
      setupState.user_gladys_acccount_linked
    );
  },
  getUsersInAccount: client.getUsersInAccount,
  getInvoices: client.getInvoices,
  inviteUser: client.inviteUser,
  getInvitation: client.getInvitation,
  calculateLatency: () => client.calculateLatency(),
  connectSocket: async callback => {
    let refreshToken = keyValStore.get('refresh_token');
    let serializedKeys = keyValStore.get('serialized_keys');

    return client.userConnect(refreshToken, serializedKeys, callback);
  },
  getInstance: () => client.getInstance(),
  getSetupState: () => client.getSetupState(),
  subcribeMonthlyPlan: client.subcribeMonthlyPlan,
  subcribeMonthlyPlanWithoutAccount: client.subcribeMonthlyPlanWithoutAccount,
  reSubcribeMonthlyPlan: client.reSubcribeMonthlyPlan,
  getCard: client.getCard,
  cancelMonthlyPlan: client.cancelMonthlyPlan,
  updateCard: client.updateCard,
  createApiKey: client.createApiKey,
  getApiKeys: client.getApiKeys,
  updateApiKeyName: client.updateApiKeyName,
  revokeApiKey: client.revokeApiKey,
  adminGetAccounts: client.adminGetAccounts,
  adminResendConfirmationEmail: client.adminResendConfirmationEmail,
  request: {
    get: redirectWrapper(client.sendRequestGet),
    post: redirectWrapper(client.sendRequestPost),
    patch: redirectWrapper(client.sendRequestPatch)
  },
  saveTwoFactorAccessToken: token => keyValStore.set('two_factor_access_token', token),
  getTwoFactorAccessToken: token => keyValStore.get('two_factor_access_token'),
  saveLoginInformations: data => {
    keyValStore.set('refresh_token', data.refreshToken);
    keyValStore.set('access_token', data.accessToken);
    keyValStore.set('device_id', data.deviceId);
    keyValStore.set('serialized_keys', data.serializedKeys);
    keyValStore.set('rsa_public_key_fingerprint', data.rsaPublicKeyFingerprint);
    keyValStore.set('ecdsa_public_key_fingerprint', data.ecdsaPublicKeyFingerprint);
  },
  getUserKeyFingerprint: async () => {
    let rsaPublicKeyFingerprint = keyValStore.get('rsa_public_key_fingerprint');
    let ecdsaPublicKeyFingerprint = keyValStore.get('ecdsa_public_key_fingerprint');

    return {
      rsaPublicKeyFingerprint,
      ecdsaPublicKeyFingerprint
    };
  },
  saveUser: user => keyValStore.set('user', user),
  getUser: async () => {
    let user = keyValStore.get('user');
    if (user) {
      return Promise.resolve(JSON.parse(user));
    }
    user = await client.getMyself();
    await keyValStore.set('user', JSON.stringify(user));
    return user;
  },
  isConnected: async () => {
    let refreshToken = keyValStore.get('refresh_token');
    if (refreshToken) {
      return true;
    }
    return false;
  },
  cleanLocalState: () => {
    keyValStore.clear();
  },
  testBrowserCompatibility: () => {
    let browserCompatible = true;

    if (!window.crypto || !window.crypto.subtle) {
      browserCompatible = false;
    }

    return browserCompatible;
  },
  cache: {
    get: key => JSON.parse(keyValStore.get(key)),
    set: (key, value) => keyValStore.set(key, JSON.stringify(value))
  }
};

export default Auth;
