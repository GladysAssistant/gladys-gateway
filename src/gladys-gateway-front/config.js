
const local = {
  serverUrl: process.env.SERVER_URL,
  accessTokenCookieKey: 'gladys-gateway-access-token',
  refreshTokenCookieKey: 'gladys-gateway-refresh-token',
  stripeApiKey: process.env.STRIPE_API_KEY
};

const prod = {
  serverUrl: ''
};

const config = process.env.NODE_ENV === 'production' ? prod : local;

export default config;