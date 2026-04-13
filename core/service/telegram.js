const axios = require('axios');

module.exports = function TelegramService(logger) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const telegramConfigured = botToken && chatId;

  async function sendAlert(text) {
    try {
      if (!telegramConfigured) {
        logger.info(`Telegram: Not sending message. "${text}`);
        return;
      }
      logger.debug(`Telegram: Sending message ${text} to ${chatId}`);
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text,
      });
    } catch (e) {
      logger.warn(e);
    }
  }

  return {
    sendAlert,
  };
};
