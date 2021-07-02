const TelegramBot = require('node-telegram-bot-api');

module.exports = function TelegramService(logger) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const telegramConfigured = botToken && chatId;
  const bot = telegramConfigured ? new TelegramBot(botToken) : null;
  function sendAlert(text) {
    try {
      if (!bot) {
        logger.info(`Telegram: Not sending message. "${text}`);
        return;
      }
      logger.debug(`Telegram: Sending message ${text} to ${chatId}`);
      bot.sendMessage(chatId, text);
    } catch (e) {
      logger.warn(e);
    }
  }

  return {
    sendAlert,
  };
};
