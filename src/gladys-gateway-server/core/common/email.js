const ejs = require('ejs');
const fs = require('fs');

module.exports = {
  confirmation: {
    en: {
      subject: 'Gladys Plus - Confirm your email address',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/confirmation.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Gladys Plus - Confirmez votre adresse email',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/confirmation.ejs`, 'utf8')),
    },
  },
  invitation: {
    en: {
      subject: 'Gladys Plus - Welcome!',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/invitation.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Gladys Plus - Bienvenue !',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/invitation.ejs`, 'utf8')),
    },
  },
  password_reset: {
    en: {
      subject: 'Gladys Plus - Password reset',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/password_reset.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Gladys Plus - Réinitialiser votre mot de passe',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/password_reset.ejs`, 'utf8')),
    },
  },
  payment_failed: {
    en: {
      subject: 'Payment failed on Gladys Plus',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/payment_failed.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Le paiement a échoué sur Gladys Plus',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/payment_failed.ejs`, 'utf8')),
    },
  },
  welcome: {
    en: {
      subject: 'Gladys Plus - Confirm your email address',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/welcome.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Gladys Plus - Confirmez votre adresse email',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/welcome.ejs`, 'utf8')),
    },
  },
};
