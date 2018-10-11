require('dotenv').config();

const { SERVER_URL , STRIPE_API_KEY } = process.env;
const webpack = require('webpack');

module.exports = function (config) {
  config.plugins.push(
    new webpack.DefinePlugin({
      'process.env.SERVER_URL': JSON.stringify(SERVER_URL),
      'process.env.STRIPE_API_KEY': JSON.stringify(STRIPE_API_KEY)
    })
  );
};