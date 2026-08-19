const { expect } = require('chai');

const {
  buildPaymentFailedScope,
  buildSubscriptionWillRenewScope,
  buildTrialWillEndScope,
  buildWelcomeScope,
  extractFirstname,
  formatBillingDate,
  formatInvoiceAmount,
  formatPrice,
  getPlanBenefits,
  getPlanName,
  getPlanProductName,
  getInvoiceInterval,
  getRenewalDate,
  getWelcomeSteps,
  hasRecentPaymentFailedEmail,
  hasRecentRenewalReminderEmail,
} = require('../../../core/common/billing-email-scope');

describe('billing-email-scope', () => {
  const previousLitePlanProductId = process.env.STRIPE_LITE_PLAN_PRODUCT_ID;

  before(() => {
    process.env.STRIPE_LITE_PLAN_PRODUCT_ID = 'lite-product-id';
    process.env.GLADYS_PLUS_BACKEND_URL = 'https://api.gladys.plus';
    process.env.GLADYS_PLUS_FRONTEND_URL = 'https://plus.gladysassistant.com';
  });

  after(() => {
    process.env.STRIPE_LITE_PLAN_PRODUCT_ID = previousLitePlanProductId;
  });

  it('should detect lite and plus plan names', () => {
    expect(getPlanName('lite-product-id')).to.equal('Lite');
    expect(getPlanName('plus-product-id')).to.equal('Plus');
    expect(getPlanProductName('Lite')).to.equal('Gladys Plus Lite');
    expect(getPlanProductName('Plus')).to.equal('Gladys Plus');
  });

  it('should format monthly and yearly prices', () => {
    expect(formatPrice(999, 'eur', 'month', 'fr')).to.equal('9,99\u00a0€/mois');
    expect(formatPrice(999, 'eur', 'month', 'en')).to.equal('€9.99/month');
    expect(formatPrice(9999, 'eur', 'year', 'en')).to.equal('€99.99/year');
    expect(formatPrice(9999, 'eur', 'year', 'fr')).to.equal('99,99\u00a0€/an');
  });

  it('should format billing dates per language', () => {
    const timestamp = Math.floor(new Date('2026-06-25T12:00:00Z').getTime() / 1000);
    expect(formatBillingDate(timestamp, 'fr')).to.equal('25 juin 2026');
    expect(formatBillingDate(timestamp, 'en')).to.equal('25 June 2026');
  });

  it('should build trial_will_end scope with customer firstname and plan benefits', () => {
    const scope = buildTrialWillEndScope({
      subscription: {
        trial_end: Math.floor(new Date('2026-06-25T12:00:00Z').getTime() / 1000),
        items: {
          data: [
            {
              price: {
                unit_amount: 999,
                currency: 'eur',
                recurring: { interval: 'month' },
                product: 'plus-product-id',
              },
            },
          ],
        },
      },
      customer: { name: 'Marie Dupont' },
      language: 'fr',
      account: { stripe_portal_key: 'portal-key' },
    });

    expect(scope.firstname).to.equal('Marie');
    expect(scope.planName).to.equal('Plus');
    expect(scope.amount).to.equal('9,99\u00a0€/mois');
    expect(scope.planBenefits).to.deep.equal(getPlanBenefits('Plus', 'fr'));
    expect(scope.updateCardLink).to.equal('https://api.gladys.plus/accounts/stripe_customer_portal/portal-key');
  });

  it('should build payment_failed scope with invoice details', () => {
    const scope = buildPaymentFailedScope({
      invoice: {
        amount_due: 699,
        currency: 'eur',
        created: Math.floor(new Date('2026-06-22T12:00:00Z').getTime() / 1000),
        next_payment_attempt: Math.floor(new Date('2026-06-25T12:00:00Z').getTime() / 1000),
        hosted_invoice_url: 'https://invoice.stripe.com/example',
      },
      customer: { name: 'John Smith' },
      language: 'en',
      account: { stripe_portal_key: 'portal-key', plan: 'lite' },
    });

    expect(scope.firstname).to.equal('John');
    expect(scope.planName).to.equal('Lite');
    expect(scope.amount).to.equal('€6.99');
    expect(scope.hostedInvoiceUrl).to.equal('https://invoice.stripe.com/example');
    expect(scope.nextRetryDate).to.equal('25 June 2026');
    expect(formatInvoiceAmount(699, 'eur', 'en')).to.equal('€6.99');
  });

  it('should include backup step only for Plus welcome steps', () => {
    const liteSteps = getWelcomeSteps('Lite', 'en');
    const plusSteps = getWelcomeSteps('Plus', 'en');

    expect(liteSteps).to.have.lengthOf(6);
    expect(plusSteps).to.have.lengthOf(8);
    expect(plusSteps.some((step) => step.includes('backups'))).to.equal(true);
    expect(liteSteps.some((step) => step.includes('backups'))).to.equal(false);
    expect(plusSteps.some((step) => step.includes('AI'))).to.equal(true);
    expect(liteSteps.some((step) => step.includes('AI'))).to.equal(false);
  });

  it('should build welcome scope with trial info', () => {
    const trialEndDate = new Date();
    trialEndDate.setUTCDate(trialEndDate.getUTCDate() + 30);
    trialEndDate.setUTCHours(12, 0, 0, 0);
    const trialEnd = Math.floor(trialEndDate.getTime() / 1000);
    const scope = buildWelcomeScope({
      confirmationUrlGladys4: 'https://plus.gladysassistant.com/signup',
      customer: { name: 'Marie Dupont' },
      subscription: { trial_end: trialEnd },
      plan: 'plus',
      language: 'fr',
    });

    expect(scope.firstname).to.equal('Marie');
    expect(scope.planName).to.equal('Plus');
    expect(scope.planProductName).to.equal('Gladys Plus');
    expect(scope.hasTrial).to.equal(true);
    expect(scope.trialEndDate).to.equal(formatBillingDate(trialEnd, 'fr'));
    expect(scope.welcomeSteps).to.have.lengthOf(8);
  });

  it('should treat Stripe auto locale as French in welcome scope', () => {
    const trialEndDate = new Date();
    trialEndDate.setUTCDate(trialEndDate.getUTCDate() + 60);
    trialEndDate.setUTCHours(12, 0, 0, 0);
    const trialEnd = Math.floor(trialEndDate.getTime() / 1000);
    const scope = buildWelcomeScope({
      confirmationUrlGladys4: 'https://plus.gladysassistant.com/signup',
      customer: { name: 'Marc' },
      subscription: { trial_end: trialEnd },
      plan: 'plus',
      language: 'auto',
    });

    expect(scope.trialEndDate).to.equal(formatBillingDate(trialEnd, 'fr'));
    expect(scope.welcomeSteps[0]).to.include('Active ton compte');
  });

  it('should handle empty billing inputs and firstname edge cases', () => {
    expect(extractFirstname(null)).to.equal('');
    expect(extractFirstname('   ')).to.equal('');
    expect(formatBillingDate(null, 'en')).to.equal('');
    expect(formatPrice(null, 'eur', 'month', 'en')).to.equal('');
    expect(formatInvoiceAmount(null, 'eur', 'en')).to.equal('');
  });

  it('should build lite welcome scope without trial', () => {
    const scope = buildWelcomeScope({
      confirmationUrlGladys4: 'https://plus.gladysassistant.com/signup',
      customer: {},
      subscription: {},
      plan: 'lite',
      language: 'en',
    });

    expect(scope.planName).to.equal('Lite');
    expect(scope.planProductName).to.equal('Gladys Plus Lite');
    expect(scope.hasTrial).to.equal(false);
    expect(scope.trialEndDate).to.equal('');
    expect(scope.welcomeSteps).to.have.lengthOf(6);
    expect(getPlanBenefits('Lite', 'en')).to.have.lengthOf(3);
    expect(getPlanBenefits('Lite', 'fr')).to.have.lengthOf(3);
    expect(getPlanBenefits('Plus', 'en')).to.have.lengthOf(3);
    expect(getPlanBenefits('Plus', 'fr')).to.have.lengthOf(3);
  });

  it('should build french welcome steps and payment scope without optional invoice fields', () => {
    const frSteps = getWelcomeSteps('Plus', 'fr');
    expect(frSteps.some((step) => step.includes('agent IA'))).to.equal(true);

    const scope = buildPaymentFailedScope({
      invoice: {
        amount_due: 999,
        currency: 'eur',
        created: Math.floor(new Date('2026-06-22T12:00:00Z').getTime() / 1000),
      },
      customer: {},
      language: 'fr',
      account: { stripe_portal_key: 'portal-key', plan: 'plus' },
    });

    expect(scope.nextRetryDate).to.equal('');
    expect(scope.hostedInvoiceUrl).to.equal('');
    expect(scope.planName).to.equal('Plus');
  });

  it('should read the billing interval of an upcoming invoice', () => {
    expect(getInvoiceInterval({ lines: { data: [{ price: { recurring: { interval: 'year' } } }] } })).to.equal('year');
    expect(getInvoiceInterval({ lines: { data: [{ price: { recurring: { interval: 'month' } } }] } })).to.equal(
      'month',
    );
    expect(getInvoiceInterval({})).to.equal(null);
  });

  it('should read the renewal date of an upcoming invoice, whichever field carries it', () => {
    expect(getRenewalDate({ next_payment_attempt: 1700000000, period_end: 1600000000 })).to.equal(1700000000);
    expect(getRenewalDate({ period_end: 1600000000 })).to.equal(1600000000);
    expect(getRenewalDate({ lines: { data: [{ period: { end: 1500000000 } }] } })).to.equal(1500000000);
  });

  it('should build the subscription_will_renew scope', () => {
    const scope = buildSubscriptionWillRenewScope({
      invoice: {
        next_payment_attempt: 1767225600, // 1 January 2026
        amount_due: 9999,
        currency: 'eur',
      },
      customer: { name: 'Pierre-Gilles Leymarie' },
      language: 'fr',
      account: { plan: 'plus', stripe_portal_key: 'portal-key' },
    });

    expect(scope.firstname).to.equal('Pierre-Gilles');
    expect(scope.renewalDate).to.equal('1 janvier 2026');
    expect(scope.amount).to.equal('99,99\u00a0€');
    expect(scope.planName).to.equal('Plus');
    expect(scope.planBenefits).to.have.length.above(0);
    expect(scope.manageSubscriptionLink).to.equal('https://api.gladys.plus/accounts/stripe_customer_portal/portal-key');
  });

  it('should detect recent renewal reminder emails in the database', async () => {
    const accountId = 'be2b9666-5c72-451e-98f4-efca76ffef54';

    const hasRecentBefore = await hasRecentRenewalReminderEmail(TEST_DATABASE_INSTANCE, accountId);
    expect(hasRecentBefore).to.equal(false);

    await TEST_DATABASE_INSTANCE.t_account_payment_activity.insert({
      stripe_event: 'invoice.upcoming',
      account_id: accountId,
      amount_paid: 0,
      closed: false,
      currency: 'eur',
      params: {},
    });

    const hasRecentAfter = await hasRecentRenewalReminderEmail(TEST_DATABASE_INSTANCE, accountId);
    expect(hasRecentAfter).to.equal(true);
  });

  it('should detect recent payment failed emails in the database', async () => {
    const accountId = 'be2b9666-5c72-451e-98f4-efca76ffef54';

    const hasRecentBefore = await hasRecentPaymentFailedEmail(TEST_DATABASE_INSTANCE, accountId);
    expect(hasRecentBefore).to.equal(false);

    await TEST_DATABASE_INSTANCE.t_account_payment_activity.insert({
      stripe_event: 'invoice.payment_failed',
      account_id: accountId,
      hosted_invoice_url: 'https://invoice.test',
      invoice_pdf: 'https://invoice.test/pdf',
      amount_paid: 0,
      closed: false,
      currency: 'eur',
      params: {},
    });

    const hasRecentAfter = await hasRecentPaymentFailedEmail(TEST_DATABASE_INSTANCE, accountId);
    expect(hasRecentAfter).to.equal(true);
  });
});
