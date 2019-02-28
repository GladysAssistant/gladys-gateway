const logger = require('tracer').colorConsole();
const Mail = require('../../../core/service/mail');

describe.skip('mail', function send() {
  this.timeout(10000);
  it('should send email', () => {
    const mail = Mail(logger);
    return mail.send({ email: 'hello@gladysassistant.com', language: 'en' }, 'confirmation', {
      confirmationUrl: 'https://gladysassistant.com',
    });
  });
});
