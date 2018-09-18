describe('mailgun', function() {
  it('should send email', function() {
    var mailgun = require('../../../core/service/mailgun')();
    return mailgun.send({ email: 'tony.stark@gladysproject.com', language: 'en' }, 'confirmation', {
      confirmationUrl: 'https://gladysproject.com'
    });
  });
});