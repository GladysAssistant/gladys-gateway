import config from '../../config';
import gladysGatewayClient from '@gladysproject/gladys-gateway-js';
import keyValStore from './keyValStore';
import { route } from 'preact-router';

let client = gladysGatewayClient({ serverUrl: config.serverUrl, cryptoLib: window.crypto });

function redirectWrapper(func) {
  return function(url, params) {
    return func(url, params).catch((err) => {
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
    let refreshToken = await keyValStore.get('refresh_token');
    let rsaKeys = await keyValStore.get('rsa_keys');
    let ecdsaKeys = await keyValStore.get('ecdsa_keys');

    return client.userConnect(refreshToken, rsaKeys, ecdsaKeys, callback);
  },
  getInstance: () => client.getInstance(),
  getSetupState: () => client.getSetupState(),
  subcribeMonthlyPlan: sourceId => client.subcribeMonthlyPlan(sourceId),
  reSubcribeMonthlyPlan: client.reSubcribeMonthlyPlan,
  getCard: client.getCard,
  cancelMonthlyPlan: client.cancelMonthlyPlan,
  updateCard: client.updateCard,
  request: {
    get: redirectWrapper(client.request.get),
    post: redirectWrapper(client.request.post),
    patch: redirectWrapper(client.request.patch)
  },
  saveTwoFactorAccessToken: token => keyValStore.set('two_factor_access_token', token),
  getTwoFactorAccessToken: token => keyValStore.get('two_factor_access_token'),
  saveLoginInformations: data => {
    keyValStore.set('refresh_token', data.refreshToken);
    keyValStore.set('access_token', data.accessToken);
    keyValStore.set('device_id', data.deviceId);

    keyValStore.set('rsa_keys', data.rsaKeys);
    keyValStore.set('ecdsa_keys', data.ecdsaKeys);
  },
  saveUser: user => keyValStore.set('user', user),
  getUser: async () => {
    let user = await keyValStore.get('user');
    if (user) {
      return user;
    }
    user = await client.getMyself();
    await keyValStore.set('user', user);
    return user;
  },
  isConnected: async () => {
    let refreshToken = await keyValStore.get('refresh_token');
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

    if (!window.indexedDB) {
      browserCompatible = false;
    }

    return browserCompatible;
  },
  cache: {
    get: keyValStore.get,
    set: keyValStore.set
  }
};

export default Auth;