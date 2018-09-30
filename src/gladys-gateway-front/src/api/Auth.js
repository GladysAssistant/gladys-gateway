import config from '../../config';
import gladysGatewayClient from 'gladys-gateway-js';
import Cookies from 'js-cookie';

let client = gladysGatewayClient({ serverUrl: config.serverUrl, cryptoLib: window.crypto });

export default {
  login: data => client.login(data.email, data.password),
  loginTwoFactor: (accessToken, password, twoFactorCode) => client.loginTwoFactor(accessToken, password, twoFactorCode),
  signup: data => client.signup(data.name, data.email, data.password, data.language),
  confirmEmail: token => client.confirmEmail(token),
  configureTwoFactor: accessToken => client.configureTwoFactor(accessToken),
  enableTwoFactor: (accessToken, twoFactorCode) => client.enableTwoFactor(accessToken, twoFactorCode),
  getAccessToken: () => Cookies.get(config.accessTokenCookieKey),
  connectSocket: refreshToken => client.userConnect(refreshToken),
  saveAccessToken: accessToken =>
    Cookies.set(config.accessTokenCookieKey, accessToken, { expires: 1 }),
  saveRefreshToken: refreshToken =>
    Cookies.set(config.accessTokenCookieKey, refreshToken, { expires: 30 })
};
