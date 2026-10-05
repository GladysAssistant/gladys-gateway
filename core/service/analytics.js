const axios = require('axios');
const { Batcher } = require('bottleneck');

module.exports = function AnalyticsService(logger) {
  const batcher = new Batcher({
    maxTime: 20 * 1000, // every 20 seconds flush
    maxSize: 20,
  });
  batcher.on('batch', async (rows) => {
    const { ANALYTICS_URL, ANALYTICS_API_TOKEN } = process.env;
    if (ANALYTICS_URL && ANALYTICS_API_TOKEN) {
      try {
        await axios.post(ANALYTICS_URL, rows, {
          headers: {
            authorization: `Bearer ${ANALYTICS_API_TOKEN}`,
          },
        });
      } catch (e) {
        logger.warn('Unable to send analytics');
        logger.warn(e);
      }
    }
  });
  // The metrics are only collected when an analytics backend is configured
  function isEnabled() {
    return Boolean(process.env.ANALYTICS_URL && process.env.ANALYTICS_API_TOKEN);
  }
  async function sendMetric(type, value, userId) {
    if (!isEnabled()) {
      return;
    }
    try {
      batcher.add({
        user_id: userId,
        short_user_id: userId.slice(0, 6),
        type,
        request_size: value,
      });
    } catch (e) {
      logger.warn('Unable to add event to batch');
      logger.warn(e);
    }
  }
  // Approximate size of a relayed websocket message, only computed when the metrics are
  // collected: a message can weigh up to maxHttpBufferSize (25 MB). JSON.stringify is native,
  // far cheaper than walking the object; it throws on a very deeply nested payload, which
  // must never fail the relay.
  function sendMessageSizeMetric(type, message, userId) {
    if (!isEnabled()) {
      return;
    }
    let size;
    try {
      size = Buffer.byteLength(JSON.stringify(message) || '');
    } catch (e) {
      logger.warn(`Unable to measure the size of a ${type} message`);
      return;
    }
    sendMetric(type, size, userId);
  }
  return {
    sendMetric,
    sendMessageSizeMetric,
  };
};
