describe('mailgun', function() {
  it('should send email', function() {
    const logger = require('tracer').colorConsole();
    var mailgun = require('../../../core/service/mailgun')(logger);
    return mailgun.send({ email: 'tony.stark@gladysproject.com', language: 'en' }, 'confirmation', {
      confirmationUrl: 'https://gladysproject.com'
    });
  });
});