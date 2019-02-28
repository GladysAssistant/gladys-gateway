const logger = require('tracer').colorConsole();
const Mail = require('../../../core/service/mail');

describe.skip('mail', () => {
  it('should send email', () => {
    const mail = Mail(logger);
    return mail.send({ email: 'tony.stark@gladysassistant.com', language: 'en' }, 'confirmation', {
      confirmationUrl: 'https://gladysassistant.com',
    });
  });
});
