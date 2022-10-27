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
  async function sendMetric(type, value, userId) {
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
  return {
    sendMetric,
  };
};
