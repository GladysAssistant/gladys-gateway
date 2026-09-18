const fs = require('fs');
const { expect } = require('chai');
const templates = require('../../../core/common/email');
const { LOGO_CONTENT_ID, LOGO_PATH } = require('../../../core/common/email-logo');
const {
  buildPaymentFailedScope,
  buildSubscriptionWillRenewScope,
  buildTrialWillEndScope,
  buildWelcomeReminderScope,
  buildWelcomeScope,
} = require('../../../core/common/billing-email-scope');

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

  it('should ship the header logo, small enough to attach to every email', () => {
    const { size } = fs.statSync(LOGO_PATH);
    expect(size).to.be.above(0);
    expect(size, 'the logo is attached to every email, it has to stay tiny').to.be.below(10 * 1024);
  });

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

        it('should reference the attached logo, never an inlined or remote image', () => {
          expect(html).to.include(`src="cid:${LOGO_CONTENT_ID}"`);
          // A data: URI is dropped by Gmail and Outlook, a remote image needs hosting
          expect(html).to.not.include('src="data:');
          expect(html).to.not.include('src="http');
          // The wordmark carries the brand when images are blocked, so alt stays empty
          expect(html).to.include('alt=""');
        });
      });
    });
  });

  /**
   * The billing emails name the product the customer pays for. Building the name from
   * "Gladys Plus" plus the plan is what used to print "Gladys Plus Plus", so they take
   * planProductName from the scope builders instead.
   */
  describe('plan name in the billing emails', () => {
    const CHARGE_DATE = Math.floor(new Date('2026-06-22T12:00:00Z').getTime() / 1000);
    const RENEWAL_DATE = Math.floor(new Date('2026-06-25T12:00:00Z').getTime() / 1000);

    function renderBillingEmails(plan, language) {
      const account = { stripe_portal_key: 'portal-key', plan };

      return {
        trial_will_end: templates.trial_will_end[language].ejs(
          buildTrialWillEndScope({
            subscription: {
              trial_end: RENEWAL_DATE,
              items: {
                data: [
                  {
                    price: {
                      unit_amount: 999,
                      currency: 'eur',
                      recurring: { interval: 'month' },
                      product: plan === 'lite' ? process.env.STRIPE_LITE_PLAN_PRODUCT_ID : 'plus-product-id',
                    },
                  },
                ],
              },
            },
            customer: { name: 'Tony Stark' },
            language,
            account,
          }),
        ),
        payment_failed: templates.payment_failed[language].ejs(
          buildPaymentFailedScope({
            invoice: { amount_due: 999, currency: 'eur', created: CHARGE_DATE },
            customer: { name: 'Tony Stark' },
            language,
            account,
          }),
        ),
        subscription_will_renew: templates.subscription_will_renew[language].ejs(
          buildSubscriptionWillRenewScope({
            invoice: { next_payment_attempt: RENEWAL_DATE, amount_due: 9999, currency: 'eur' },
            customer: { name: 'Tony Stark' },
            language,
            account,
          }),
        ),
      };
    }

    let originalLitePlanProductId;

    before(() => {
      originalLitePlanProductId = process.env.STRIPE_LITE_PLAN_PRODUCT_ID;
      process.env.STRIPE_LITE_PLAN_PRODUCT_ID = 'lite-product-id';
    });

    after(() => {
      if (originalLitePlanProductId === undefined) {
        delete process.env.STRIPE_LITE_PLAN_PRODUCT_ID;
      } else {
        process.env.STRIPE_LITE_PLAN_PRODUCT_ID = originalLitePlanProductId;
      }
    });

    LANGUAGES.forEach((language) => {
      it(`should name the Plus product "Gladys Plus", never "Gladys Plus Plus" (${language})`, () => {
        Object.entries(renderBillingEmails('plus', language)).forEach(([name, html]) => {
          expect(html, `${name}.${language} repeats the plan name`).to.not.include('Gladys Plus Plus');
          expect(html, `${name}.${language} does not name the product`).to.include('Gladys Plus');
        });
      });

      it(`should name the Lite product "Gladys Plus Lite" (${language})`, () => {
        Object.entries(renderBillingEmails('lite', language)).forEach(([name, html]) => {
          expect(html, `${name}.${language} does not name the Lite product`).to.include('Gladys Plus Lite');
        });
      });
    });
  });
});
