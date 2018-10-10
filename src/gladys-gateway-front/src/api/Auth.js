import config from '../../config';
import gladysGatewayClient from '@gladysproject/gladys-gateway-js';
import Cookies from 'js-cookie';
import keyValStore from './keyValStore';

let client = gladysGatewayClient({ serverUrl: config.serverUrl, cryptoLib: window.crypto });

export default {
  login: data => client.login(data.email, data.password),
  loginTwoFactor: (accessToken, password, twoFactorCode) => client.loginTwoFactor(accessToken, password, twoFactorCode),
  signup: data => client.signup(data.name, data.email, data.password, data.language),
  confirmEmail: token => client.confirmEmail(token),
  configureTwoFactor: accessToken => client.configureTwoFactor(accessToken),
  enableTwoFactor: (accessToken, twoFactorCode) => client.enableTwoFactor(accessToken, twoFactorCode),
  getAccessToken: () => Cookies.get(config.accessTokenCookieKey),
  getRefreshToken: () => Cookies.get(config.refreshTokenCookieKey),
  getMySelf: () => client.getMyself(),
  getUsersInAccount: () => client.getUsersInAccount(),
  inviteUser: email => client.inviteUser(email),
  connectSocket: async () => {
    let refreshToken = await keyValStore.get('refresh_token');
    let rsaKeys = await keyValStore.get('rsa_keys');
    let ecdsaKeys = await keyValStore.get('ecdsa_keys');

    return client.userConnect(refreshToken, rsaKeys, ecdsaKeys);
  },
  getInstance: () => client.getInstance(),
  request: client.request,
  saveLoginInformations: (data) => {
    keyValStore.set('refresh_token', data.refreshToken);
    keyValStore.set('access_token', data.accessToken);

    keyValStore.set('rsa_keys', data.rsaKeys);
    keyValStore.set('ecdsa_keys', data.ecdsaKeys);
  },
  cache: {
    get: keyValStore.get,
    set: keyValStore.set
  }
};
