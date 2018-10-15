import config from '../../config';
import gladysGatewayClient from '@gladysproject/gladys-gateway-js';
import Cookies from 'js-cookie';
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
  loginTwoFactor: (accessToken, password, twoFactorCode) =>
    client.loginTwoFactor(accessToken, password, twoFactorCode),
  signup: data => client.signup(data.name, data.email, data.password, data.language),
  confirmEmail: token => client.confirmEmail(token),
  configureTwoFactor: accessToken => client.configureTwoFactor(accessToken),
  enableTwoFactor: (accessToken, twoFactorCode) =>
    client.enableTwoFactor(accessToken, twoFactorCode),
  getAccessToken: () => Cookies.get(config.accessTokenCookieKey),
  getRefreshToken: () => Cookies.get(config.refreshTokenCookieKey),
  getMySelf: () => client.getMyself(),
  updateMyself: data => client.updateMyself(data),
  getUsersInAccount: () => client.getUsersInAccount(),
  inviteUser: email => client.inviteUser(email),
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

    keyValStore.set('rsa_keys', data.rsaKeys);
    keyValStore.set('ecdsa_keys', data.ecdsaKeys);
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