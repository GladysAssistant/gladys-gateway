import config from '../../config';
import gladysGatewayClient from 'gladys-gateway-js';
import Cookies from 'js-cookie';

let client = gladysGatewayClient({ serverUrl: config.serverUrl, cryptoLib: window.crypto });

export default {
  login: data => client.login(data.email, data.password),
  signup: data => client.signup(data.name, data.email, data.password, data.language),
  confirmEmail: token => client.confirmEmail(token),
  configureTwoFactor: accessToken => client.configureTwoFactor(accessToken),
  getAccessToken: () => Cookies.get(config.accessTokenCookieKey),
  saveAccessToken: accessToken =>
    Cookies.set(config.accessTokenCookieKey, accessToken, { expires: 1 })
};
