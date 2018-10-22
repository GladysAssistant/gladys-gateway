
const local = {
  serverUrl: process.env.SERVER_URL,
  stripeApiKey: process.env.STRIPE_API_KEY
};

const prod = {
  serverUrl: process.env.SERVER_URL,
  stripeApiKey: process.env.STRIPE_API_KEY
};

const config = process.env.NODE_ENV === 'production' ? prod : local;

export default config;