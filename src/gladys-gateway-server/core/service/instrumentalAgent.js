const I = require('instrumental-agent');

module.exports = function InstrumentalAgentService(logger) {
  I.configure({
    apiKey: process.env.INSTRUMENTAL_AGENT_API_KEY,
    enabled: process.env.NODE_ENV === 'production',
  });
  async function sendMetric(name, value) {
    try {
      I.gauge(name, value);
    } catch (e) {
      logger.warn(e);
    }
  }
  return {
    sendMetric,
  };
};
