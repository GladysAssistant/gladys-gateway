const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

const { colors, styles, tone } = require('./email-theme');
const { LOGO_CONTENT_ID } = require('./email-logo');

const TEMPLATE_DIR = path.join(__dirname, 'email-template');

/**
 * Subject line of every transactional email, per template and per language.
 * The body lives in email-template/<language>/<template>.ejs.
 */
const SUBJECTS = {
  account_deletion_warning: {
    en: 'Your Gladys Plus account and backups will be deleted soon',
    fr: 'Ton compte Gladys Plus et tes sauvegardes seront bientôt supprimés',
  },
  confirmation: {
    en: 'Confirm your Gladys Plus email address',
    fr: 'Confirme ton adresse email Gladys Plus',
  },
  invitation: {
    en: "You're invited to Gladys Plus",
    fr: 'Tu es invité sur Gladys Plus',
  },
  password_reset: {
    en: 'Gladys Plus - Reset your password',
    fr: 'Gladys Plus - Réinitialise ton mot de passe',
  },
  email_changed: {
    en: 'Gladys Plus - Your email address was changed',
    fr: 'Gladys Plus - Ton adresse email a été modifiée',
  },
  payment_failed: {
    en: 'Action needed: update your card to keep Gladys Plus',
    fr: 'Mets à jour ta carte pour garder Gladys Plus',
  },
  recovery_codes_reminder: {
    en: 'Remember to generate your Gladys Plus recovery codes',
    fr: 'Pense à générer tes codes de récupération Gladys Plus',
  },
  welcome: {
    en: 'Welcome to Gladys Plus: activate your account',
    fr: 'Bienvenue sur Gladys Plus : active ton compte',
  },
  welcome_reminder: {
    en: 'Your Gladys Plus account is not activated yet',
    fr: "Ton compte Gladys Plus n'est pas encore activé",
  },
  welcome_back: {
    en: 'Gladys Plus - Welcome back!',
    fr: 'Gladys Plus - Bon retour !',
  },
  subscription_will_renew: {
    en: 'Your Gladys Plus subscription renews soon',
    fr: 'Ton abonnement Gladys Plus se renouvelle bientôt',
  },
  trial_will_end: {
    en: 'Your Gladys Plus trial is ending soon, keep your backups running',
    fr: 'Ton essai Gladys Plus se termine bientôt',
  },
};

/**
 * Compiles a template and wraps it so that every render gets the Horizon design scope:
 * `s` (inline style atoms), `c` (colors), `tone` (tile variants) and `logoContentId`
 * (the CID of the attached header logo), plus the language.
 * Templates and shared partials rely on those, so callers only ever pass their own data.
 *
 * `filename` is what lets EJS resolve the `include('../partials/...')` calls.
 */
function compileTemplate(templateName, language) {
  const filename = path.join(TEMPLATE_DIR, language, `${templateName}.ejs`);
  const render = ejs.compile(fs.readFileSync(filename, 'utf8'), { filename });

  return (scope) => render({ ...scope, lang: language, s: styles, c: colors, tone, logoContentId: LOGO_CONTENT_ID });
}

module.exports = Object.fromEntries(
  Object.entries(SUBJECTS).map(([templateName, subjectsByLanguage]) => [
    templateName,
    Object.fromEntries(
      Object.entries(subjectsByLanguage).map(([language, subject]) => [
        language,
        { subject, ejs: compileTemplate(templateName, language) },
      ]),
    ),
  ]),
);
