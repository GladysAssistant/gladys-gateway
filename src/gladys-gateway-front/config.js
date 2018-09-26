const local = {
  serverUrl: 'http://localhost:3000',
  accessTokenCookieKey: 'gladys-gateway-access-token',
  stripeApiKey: ''
};

const prod = {
  serverUrl: ''
};

const config = process.env.NODE_ENV === 'production' ? prod : local;

export default config;