const axios = require('axios');
const querystring = require('querystring');

module.exports = function SlackService(logger) {
  function inviteUser(email) {
    if (!process.env.SLACK_TOKEN) {
      logger.info('Slack is not enabled, resolving');
      return Promise.resolve();
    }

    return axios
      .post(
        'https://slack.com/api/users.admin.invite',
        querystring.stringify({
          token: process.env.SLACK_TOKEN,
          email,
          channels: process.env.SLACK_CHANNELS,
        }),
      )
      .catch((err) => {
        logger.warn('Unable to invite user in Slack');
        logger.warn(err);
      });
  }

  return {
    inviteUser,
  };
};
