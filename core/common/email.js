const ejs = require('ejs');
const fs = require('fs');

module.exports = {
  confirmation: {
    en: {
      subject: 'Confirm your Gladys Plus email address',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/confirmation.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Confirme ton adresse email Gladys Plus',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/confirmation.ejs`, 'utf8')),
    },
  },
  invitation: {
    en: {
      subject: "You're invited to Gladys Plus",
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/invitation.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Tu es invité sur Gladys Plus',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/invitation.ejs`, 'utf8')),
    },
  },
  password_reset: {
    en: {
      subject: 'Gladys Plus - Reset your password',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/password_reset.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Gladys Plus - Réinitialise ton mot de passe',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/password_reset.ejs`, 'utf8')),
    },
  },
  payment_failed: {
    en: {
      subject: 'Action needed: update your card to keep Gladys Plus',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/payment_failed.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Mets à jour ta carte pour garder Gladys Plus',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/payment_failed.ejs`, 'utf8')),
    },
  },
  welcome: {
    en: {
      subject: 'Welcome to Gladys Plus: activate your account',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/welcome.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Bienvenue sur Gladys Plus : active ton compte',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/welcome.ejs`, 'utf8')),
    },
  },
  welcome_back: {
    en: {
      subject: 'Gladys Plus - Welcome back!',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/welcome_back.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Gladys Plus - Bon retour !',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/welcome_back.ejs`, 'utf8')),
    },
  },
  trial_will_end: {
    en: {
      subject: 'Your Gladys Plus trial is ending soon, keep your backups running',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/trial_will_end.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Ton essai Gladys Plus se termine bientôt',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/trial_will_end.ejs`, 'utf8')),
    },
  },
};
