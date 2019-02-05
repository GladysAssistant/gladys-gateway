const logger = require('tracer').colorConsole();
const MailGun = require('../../../core/service/mailgun');

describe('mailgun', () => {
  it('should send email', () => {
    const mailgun = MailGun(logger);
    return mailgun.send({ email: 'tony.stark@gladysassistant.com', language: 'en' }, 'confirmation', {
      confirmationUrl: 'https://gladysassistant.com',
    });
  });
});
