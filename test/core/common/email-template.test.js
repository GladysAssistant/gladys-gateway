const { expect } = require('chai');
const templates = require('../../../core/common/email');
const { buildWelcomeReminderScope, buildWelcomeScope } = require('../../../core/common/billing-email-scope');

const LANGUAGES = ['fr', 'en'];

function buildScope(templateName, language) {
  const welcomeScope = buildWelcomeScope({
    confirmationUrlGladys4: 'https://gladysassistant.com/signup',
    customer: { name: 'Tony Stark' },
    subscription: { trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
    plan: 'plus',
    language,
  });

  const welcomeReminderScope = buildWelcomeReminderScope({
    confirmationUrlGladys4: 'https://gladysassistant.com/signup',
    customer: { name: 'Tony Stark' },
    account: {
      plan: 'plus',
      status: 'trialing',
      created_at: new Date(),
      current_period_end: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
    language,
  });

  return {
    confirmationUrlGladys4: 'https://gladysassistant.com/confirm-email/token',
    nameOfAdminInviting: 'Tony',
    invitationUrlGladys4: 'https://gladysassistant.com/signup?invitation=token',
    resetPasswordUrlGladys4: 'https://gladysassistant.com/reset-password/token',
    newEmail: 'new-email@gladysassistant.com',
    updateCardLink: 'https://plus.gladysassistant.com/accounts/stripe_customer_portal/key',
    loginUrl: 'https://plus.gladysassistant.com',
    firstname: 'Tony',
    trialEndDate: '25 June 2026',
    amount: '9.99',
    planName: 'Plus',
    planBenefits: ['Daily encrypted backups', 'Remote camera streaming'],
    renewalDate: '25 June 2026',
    manageSubscriptionLink: 'https://plus.gladysassistant.com/accounts/stripe_customer_portal/key',
    attemptDate: '22 June 2026',
    nextRetryDate: '25 June 2026',
    hostedInvoiceUrl: 'https://invoice.stripe.com/example',
    deletionDate: '7 October 2026',
    accessEndedDate: '2 June 2025',
    planProductName: 'Gladys Plus',
    subscribeUrl: 'https://gladysassistant.com/plus',
    recoveryCodesUrl: 'https://plus.gladysassistant.com/dashboard/settings/security',
    ...welcomeScope,
    ...(templateName === 'welcome_reminder' ? welcomeReminderScope : {}),
  };
}

describe('email templates', () => {
  const templateNames = Object.keys(templates);

  it('should expose every template in both languages, with a subject', () => {
    expect(templateNames).to.have.length.above(0);
    templateNames.forEach((name) => {
      LANGUAGES.forEach((language) => {
        expect(templates[name], `${name} is missing the "${language}" language`).to.have.property(language);
        expect(templates[name][language].subject).to.be.a('string');
        expect(templates[name][language].subject.length, `${name}.${language} has an empty subject`).to.be.above(0);
      });
    });
  });

  templateNames.forEach((name) => {
    LANGUAGES.forEach((language) => {
      describe(`${name} (${language})`, () => {
        let html;

        before(() => {
          html = templates[name][language].ejs(buildScope(name, language));
        });

        it('should render a complete HTML document', () => {
          expect(html).to.match(/^<!DOCTYPE html>/);
          expect(html).to.include(`<html lang="${language}"`);
          expect(html).to.include('</html>');
          // An unresolved include or a leftover EJS tag would show up in the output
          expect(html).to.not.include('<%');
        });

        it('should be responsive and declare both color schemes', () => {
          expect(html).to.include('<meta name="viewport" content="width=device-width, initial-scale=1" />');
          expect(html).to.include('@media only screen and (max-width: 620px)');
          expect(html).to.include('@media (prefers-color-scheme: dark)');
          expect(html).to.include('max-width: 600px');
        });

        it('should use the Horizon design and not the previous one', () => {
          // Gradient background and frosted panel of the Horizon design
          expect(html).to.include('linear-gradient');
          expect(html).to.include('border-radius: 28px');
          // The old template palette must be gone
          expect(html.toLowerCase()).to.not.include('#348eda');
          expect(html.toLowerCase()).to.not.include('#f6f6f6');
        });

        it('should render the shared header and footer', () => {
          expect(html).to.include('Gladys&nbsp;Plus');
          expect(html).to.include('Pierre-Gilles Leymarie');
          expect(html).to.include('hello@gladysassistant.com');
        });
      });
    });
  });
});
