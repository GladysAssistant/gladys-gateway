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
  email_changed: {
    en: {
      subject: 'Gladys Plus - Your email address was changed',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/email_changed.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Gladys Plus - Ton adresse email a été modifiée',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/email_changed.ejs`, 'utf8')),
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
  subscription_will_renew: {
    en: {
      subject: 'Your Gladys Plus subscription renews soon',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/subscription_will_renew.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Ton abonnement Gladys Plus se renouvelle bientôt',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/subscription_will_renew.ejs`, 'utf8')),
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
  starter_kit_order_confirmed: {
    en: {
      subject: 'Your Gladys starter kit: thank you for your order!',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/starter_kit_order_confirmed.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Ton kit de démarrage Gladys : merci pour ta commande !',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/starter_kit_order_confirmed.ejs`, 'utf8')),
    },
  },
  starter_kit_pickup_point_reminder: {
    en: {
      subject: 'Your Gladys starter kit: choose your pickup point',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/starter_kit_pickup_point_reminder.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Ton kit de démarrage Gladys : choisis ton point relais',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/starter_kit_pickup_point_reminder.ejs`, 'utf8')),
    },
  },
  starter_kit_status_update: {
    en: {
      subject: 'Your Gladys starter kit: order update',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/starter_kit_status_update.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Ton kit de démarrage Gladys : ta commande avance',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/starter_kit_status_update.ejs`, 'utf8')),
    },
  },
  starter_kit_shipped: {
    en: {
      subject: 'Your Gladys starter kit is on its way',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/starter_kit_shipped.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Ton kit de démarrage Gladys est en route',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/starter_kit_shipped.ejs`, 'utf8')),
    },
  },
  starter_kit_delivered: {
    en: {
      subject: 'Your Gladys starter kit has arrived',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/en/starter_kit_delivered.ejs`, 'utf8')),
    },
    fr: {
      subject: 'Ton kit de démarrage Gladys est arrivé',
      ejs: ejs.compile(fs.readFileSync(`${__dirname}/email-template/fr/starter_kit_delivered.ejs`, 'utf8')),
    },
  },
};
