const { expect } = require('chai');

const {
  buildPaymentFailedScope,
  buildTrialWillEndScope,
  buildWelcomeScope,
  formatBillingDate,
  formatInvoiceAmount,
  formatPrice,
  getPlanBenefits,
  getPlanName,
  getPlanProductName,
  getWelcomeSteps,
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
    expect(formatPrice(9999, 'eur', 'year', 'en')).to.equal('€99.99/year');
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
    expect(scope.updateCardLink).to.equal(
      'https://api.gladys.plus/accounts/stripe_customer_portal/portal-key',
    );
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
    const trialEnd = Math.floor(new Date('2026-07-25T12:00:00Z').getTime() / 1000);
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
    expect(scope.trialEndDate).to.equal('25 juillet 2026');
    expect(scope.welcomeSteps).to.have.lengthOf(8);
  });
});
