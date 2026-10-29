const axios = require('axios');

const LIST_GLADYS_PLUS_TRIAL = 'gladysPlusTrial';

// List ids on the newsletter service (GladysAssistant/newsletter).
const NEWSLETTER_LIST_IDS = {
  [LIST_GLADYS_PLUS_TRIAL]: 'gladys-plus-trial',
};

const REQUEST_TIMEOUT_IN_MS = 10 * 1000;

module.exports = function EmailListService(logger) {
  // The Axios error carries the request config, Authorization header included: never log it as is.
  function logFailure(action, email, e) {
    const status = e.response ? e.response.status : 'no response';
    logger.warn(`EmailList: ${action} failed for ${email} (${e.code || 'error'}, status ${status}): ${e.message}`);
  }

  // Calls POST {EMAIL_LIST_API_URL}/api/v1/lists/:list/(subscribe|unsubscribe) with the API token.
  async function callListApi(action, { email, list }, body) {
    const apiUrl = process.env.EMAIL_LIST_API_URL;
    const apiToken = process.env.EMAIL_LIST_API_TOKEN;
    if (!apiUrl || !apiToken) {
      logger.info(`EmailList: EMAIL_LIST_API_URL or EMAIL_LIST_API_TOKEN not set, skipping ${action} for ${email}.`);
      return;
    }
    const listId = NEWSLETTER_LIST_IDS[list];
    if (!listId) {
      logger.warn(`EmailList: unknown list ${list}, skipping ${action} for ${email}.`);
      return;
    }
    await axios.post(`${apiUrl.replace(/\/+$/, '')}/api/v1/lists/${listId}/${action}`, body, {
      headers: { Authorization: `Bearer ${apiToken}` },
      timeout: REQUEST_TIMEOUT_IN_MS,
    });
  }

  async function subscribe({ email, firstname, list, language }) {
    try {
      logger.debug(`EmailList: Subscribing ${email} to list ${list} (${language}).`);
      await callListApi(
        'subscribe',
        { email, list },
        {
          email,
          firstname: firstname || '',
          language,
        },
      );
    } catch (e) {
      logFailure('subscribe', email, e);
    }
  }

  async function unsubscribe({ email, list, language }) {
    try {
      logger.debug(`EmailList: Unsubscribing ${email} from list ${list} (${language}).`);
      await callListApi('unsubscribe', { email, list }, { email });
    } catch (e) {
      logFailure('unsubscribe', email, e);
    }
  }

  return {
    subscribe,
    unsubscribe,
    LIST_GLADYS_PLUS_TRIAL,
  };
};

module.exports.LIST_GLADYS_PLUS_TRIAL = LIST_GLADYS_PLUS_TRIAL;
