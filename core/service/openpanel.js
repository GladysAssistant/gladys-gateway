const { OpenPanel } = require('@openpanel/sdk');

module.exports = function OpenPanelService(logger) {
  let op = null;
  let opConfig = null;

  function getClient() {
    const clientId = process.env.OPENPANEL_CLIENT_ID;
    const clientSecret = process.env.OPENPANEL_CLIENT_SECRET;
    const apiUrl = process.env.OPENPANEL_API_URL;
    if (!clientId || !clientSecret) {
      return null;
    }

    const configKey = `${clientId}:${clientSecret}:${apiUrl || ''}`;
    if (!op || opConfig !== configKey) {
      op = new OpenPanel({
        clientId,
        clientSecret,
        ...(apiUrl && { apiUrl }),
      });
      opConfig = configKey;
    }
    return op;
  }

  async function trackRevenueFromCheckoutSession(session) {
    const deviceId = session.metadata?.device_id;
    if (!deviceId || session.amount_total == null) {
      return;
    }

    const client = getClient();
    if (!client) {
      logger.info('OpenPanel: not configured, skipping revenue tracking');
      return;
    }

    try {
      await client.revenue(session.amount_total / 100, {
        deviceId,
        currency: session.currency,
        ...(session.metadata?.plan && { plan: session.metadata.plan }),
      });
    } catch (e) {
      logger.warn('OpenPanel: unable to track revenue');
      logger.warn(e);
    }
  }

  return {
    trackRevenueFromCheckoutSession,
  };
};
