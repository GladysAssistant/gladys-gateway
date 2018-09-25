const ejs = require('ejs');
const fs = require('fs');

module.exports = {
  confirmation: {
    en: {
      subject: 'Gladys Gateway - Confirm your email address',
      ejs: ejs.compile(fs.readFileSync(__dirname + '/email-template/en/confirmation.ejs', 'utf8'))
    },
    fr: {
      subject: 'Gladys Gateway - Confirmez votre adresse email',
      ejs: ejs.compile(fs.readFileSync(__dirname + '/email-template/fr/confirmation.ejs', 'utf8'))
    }
  },
  invitation: {
    en: {
      subject: 'Gladys Gateway - Welcome!',
      ejs: ejs.compile(fs.readFileSync(__dirname + '/email-template/en/invitation.ejs', 'utf8'))
    },
    fr: {
      subject: 'Gladys Gateway - Bienvenue !',
      ejs: ejs.compile(fs.readFileSync(__dirname + '/email-template/fr/invitation.ejs', 'utf8'))
    }
  },
  password_reset: {
    en: {
      subject: 'Gladys Gateway - Password reset',
      ejs: ejs.compile(fs.readFileSync(__dirname + '/email-template/en/password_reset.ejs', 'utf8'))
    },
    fr: {
      subject: 'Gladys Gateway - Réinitialiser votre mot de passe',
      ejs: ejs.compile(fs.readFileSync(__dirname + '/email-template/fr/password_reset.ejs', 'utf8'))
    }
  }
};