require('dotenv').config();

const { SERVER_URL , STRIPE_API_KEY } = process.env;
const webpack = require('webpack');

const asyncPlugin = require('preact-cli-plugin-fast-async');

module.exports = function (config) {
  asyncPlugin(config);

  config.plugins.push(
    new webpack.DefinePlugin({
      'process.env.SERVER_URL': JSON.stringify(SERVER_URL),
      'process.env.STRIPE_API_KEY': JSON.stringify(STRIPE_API_KEY)
    })
  );
};