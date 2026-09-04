const { expect } = require('chai');
const tracer = require('tracer');
const nodemailer = require('nodemailer');
const Mail = require('../../../core/service/mail');

const silentLogger = tracer.colorConsole({ level: 'error' });

describe('mail service', () => {
  let originalDisableEmail;
  let originalCreateTransport;
  let sentMails;
  let telegramMessages;
  let telegramService;

  beforeEach(() => {
    originalDisableEmail = process.env.DISABLE_EMAIL;
    originalCreateTransport = nodemailer.createTransport;
    sentMails = [];
    telegramMessages = [];
    telegramService = {
      sendAlert: (text) => {
        telegramMessages.push(text);
      },
    };
    // Fake SMTP transporter so no real email is sent during tests
    nodemailer.createTransport = () => ({
      verify: (cb) => cb(null),
      sendMail: async (mailOptions) => {
        sentMails.push(mailOptions);
        return { accepted: [mailOptions.to] };
      },
    });
  });

  afterEach(() => {
    nodemailer.createTransport = originalCreateTransport;
    if (originalDisableEmail === undefined) {
      delete process.env.DISABLE_EMAIL;
    } else {
      process.env.DISABLE_EMAIL = originalDisableEmail;
    }
  });

  it('should send email to the user only, without any bcc', async () => {
    process.env.DISABLE_EMAIL = 'false';
    const mail = Mail(silentLogger, telegramService);

    await mail.send({ email: 'user@example.com', language: 'en' }, 'confirmation', {
      confirmationUrlGladys4: 'https://gladysassistant.com/confirm-email/super-secret-token',
    });

    expect(sentMails).to.have.lengthOf(1);
    expect(sentMails[0].to).to.equal('user@example.com');
    expect(sentMails[0]).to.not.have.property('bcc');
    expect(sentMails[0]).to.not.have.property('cc');
  });

  it('should notify Telegram with metadata only, never the email content', async () => {
    process.env.DISABLE_EMAIL = 'false';
    const mail = Mail(silentLogger, telegramService);
    const confirmationUrlGladys4 = 'https://gladysassistant.com/confirm-email/super-secret-token';

    await mail.send({ email: 'user@example.com', language: 'en' }, 'confirmation', { confirmationUrlGladys4 });

    expect(telegramMessages).to.have.lengthOf(1);
    expect(telegramMessages[0]).to.include('confirmation');
    expect(telegramMessages[0]).to.include('user@example.com');
    expect(telegramMessages[0]).to.not.include('super-secret-token');
    expect(telegramMessages[0]).to.not.include(confirmationUrlGladys4);
  });

  it('should not send email nor notify Telegram when email is disabled', async () => {
    process.env.DISABLE_EMAIL = 'true';
    const mail = Mail(silentLogger, telegramService);

    await mail.send({ email: 'user@example.com', language: 'en' }, 'confirmation', {
      confirmationUrlGladys4: 'https://gladysassistant.com',
    });

    expect(sentMails).to.have.lengthOf(0);
    expect(telegramMessages).to.have.lengthOf(0);
  });

  it('should reject on invalid template without sending anything', async () => {
    process.env.DISABLE_EMAIL = 'false';
    const mail = Mail(silentLogger, telegramService);

    let error;
    try {
      await mail.send({ email: 'user@example.com', language: 'en' }, 'unknown_template', {});
    } catch (e) {
      error = e;
    }

    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('INVALID_TEMPLATE_OR_LANGUAGE');
    expect(sentMails).to.have.lengthOf(0);
    expect(telegramMessages).to.have.lengthOf(0);
  });
});
