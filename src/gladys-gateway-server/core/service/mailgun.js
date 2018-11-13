const Promise = require('bluebird');
const mailgun = require('mailgun.js');

const SUPPORTED_LANGUAGE = ['en', 'fr'];

module.exports = function mailgunService(logger) {

  const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });
  const emails = require('../common/email.js');

  function send(user, template, scope) {

    // default language = en
    if (SUPPORTED_LANGUAGE.indexOf(user.language) === -1) {
      user.language = 'en';
    }

    if (!emails[template] || !emails[template][user.language]) {
      logger.info(`Invalid template or language. Template = "${template}", language = "${user.language}."`);
      return Promise.reject(new Error('INVALID_TEMPLATE_OR_LANGUAGE'));
    }

    // generating HTML base on EJS and scope
    const html = emails[template][user.language].ejs(scope);

    var data = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: emails[template][user.language].subject,
      html: html
    };

    if(process.env.MAILGUN_TEST_MODE === 'true'){
      data['o:testmode'] = 'yes';
    }

    if(process.env.DISABLE_EMAIL === 'true'){
      logger.info(`Sending email is disabled. Not sending email.`);
      
      // Displaying the scope in dev so it's easier to test
      if(process.env.NODE_ENV === 'development') {
        logger.debug(scope);
      }

      return Promise.resolve();
    }

    logger.info(`Sending ${template} email.`);
    return mg.messages.create(process.env.MAILGUN_DOMAIN, data);
  }

  return {
    send
  };
};