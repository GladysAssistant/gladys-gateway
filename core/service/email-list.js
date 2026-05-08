const axios = require('axios');

const LIST_GLADYS_PLUS_TRIAL = 'gladysPlusTrial';

module.exports = function EmailListService(logger) {
  const apiUrl = process.env.EMAIL_LIST_API_URL;

  async function subscribe({ email, firstname, list, language }) {
    try {
      if (!apiUrl) {
        logger.info(`EmailList: EMAIL_LIST_API_URL not set, skipping subscribe for ${email}.`);
        return;
      }
      logger.debug(`EmailList: Subscribing ${email} to list ${list} (${language}).`);
      await axios.post(apiUrl, {
        email,
        firstname: firstname || '',
        list,
        language,
      });
    } catch (e) {
      logger.warn(e);
    }
  }

  async function unsubscribe({ email, list, language }) {
    try {
      if (!apiUrl) {
        logger.info(`EmailList: EMAIL_LIST_API_URL not set, skipping unsubscribe for ${email}.`);
        return;
      }
      logger.debug(`EmailList: Unsubscribing ${email} from list ${list} (${language}).`);
      await axios.post(apiUrl, {
        email,
        list,
        action: 'remove',
        language,
      });
    } catch (e) {
      logger.warn(e);
    }
  }

  return {
    subscribe,
    unsubscribe,
    LIST_GLADYS_PLUS_TRIAL,
  };
};

module.exports.LIST_GLADYS_PLUS_TRIAL = LIST_GLADYS_PLUS_TRIAL;
