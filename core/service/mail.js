const Promise = require('bluebird');
const nodemailer = require('nodemailer');
const emails = require('../common/email');

const SUPPORTED_LANGUAGE = ['en', 'fr'];

module.exports = function MailService(logger) {
  let transporter;

  if (process.env.DISABLE_EMAIL !== 'true') {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
    transporter.verify((error) => {
      if (error) {
        logger.error(error);
      } else {
        logger.info('SMTP server is valid. Ready to send emails.');
      }
    });
  }

  function send(userParam, template, scope) {
    const user = userParam;
    // default language = fr
    if (SUPPORTED_LANGUAGE.indexOf(user.language) === -1) {
      user.language = 'fr';
    }

    if (!emails[template] || !emails[template][user.language]) {
      logger.warn(`Invalid template or language. Template = "${template}", language = "${user.language}."`);
      return Promise.reject(new Error('INVALID_TEMPLATE_OR_LANGUAGE'));
    }

    // generating HTML base on EJS and scope
    const html = emails[template][user.language].ejs(scope);

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      bcc: 'hello@gladysassistant.com',
      subject: emails[template][user.language].subject,
      html,
    };

    if (process.env.DISABLE_EMAIL === 'true') {
      logger.info(`Sending email is disabled. Not sending email.`);

      // Displaying the scope in dev so it's easier to test
      if (process.env.NODE_ENV === 'development') {
        logger.debug(scope);
      }

      return Promise.resolve();
    }

    logger.info(`Sending ${template} email.`);
    return transporter.sendMail(mailOptions);
  }

  return {
    send,
  };
};
