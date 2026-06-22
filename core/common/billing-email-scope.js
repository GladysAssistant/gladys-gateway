const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

function extractFirstname(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  return name.trim().split(/\s+/)[0] || '';
}

function getPlanName(productId) {
  if (productId && productId === process.env.STRIPE_LITE_PLAN_PRODUCT_ID) {
    return 'Lite';
  }
  return 'Plus';
}

function getPlanBenefits(planName, language) {
  if (planName === 'Lite') {
    return language === 'fr'
      ? [
          'Accès à distance chiffré de bout en bout',
          'Google Home et Amazon Alexa',
          'Comptes pour toute la famille',
        ]
      : [
          'End-to-end encrypted remote access',
          'Google Home & Amazon Alexa',
          'Family accounts included',
        ];
  }

  return language === 'fr'
    ? [
        'Sauvegardes quotidiennes chiffrées',
        'Streaming caméra à distance',
        'Intégrations avancées (IA, Enedis, MCP)',
      ]
    : [
        'Daily encrypted backups',
        'Remote camera streaming',
        'Advanced integrations (AI, Enedis, MCP)',
      ];
}

function formatBillingDate(timestamp, language) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp * 1000);
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatPrice(unitAmount, currency, interval, language) {
  if (unitAmount == null || !currency) {
    return '';
  }

  const amount = unitAmount / 100;
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const formattedAmount = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);

  if (interval === 'year') {
    return language === 'fr' ? `${formattedAmount}/an` : `${formattedAmount}/year`;
  }

  return language === 'fr' ? `${formattedAmount}/mois` : `${formattedAmount}/month`;
}

function formatInvoiceAmount(amountDue, currency, language) {
  if (amountDue == null || !currency) {
    return '';
  }

  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountDue / 100);
}

function buildUpdateCardLink(account) {
  return `${process.env.GLADYS_PLUS_BACKEND_URL}/accounts/stripe_customer_portal/${account.stripe_portal_key}`;
}

function buildTrialWillEndScope({ subscription, customer, language, account }) {
  const price = subscription.items?.data?.[0]?.price;
  const productId = price?.product;
  const planName = getPlanName(productId);

  return {
    firstname: extractFirstname(customer?.name),
    trialEndDate: formatBillingDate(subscription.trial_end, language),
    amount: formatPrice(price?.unit_amount, price?.currency, price?.recurring?.interval, language),
    planName,
    planBenefits: getPlanBenefits(planName, language),
    updateCardLink: buildUpdateCardLink(account),
    loginUrl: process.env.GLADYS_PLUS_FRONTEND_URL,
  };
}

function buildPaymentFailedScope({ invoice, customer, language, account }) {
  const planName = account.plan === 'lite' ? 'Lite' : 'Plus';

  return {
    firstname: extractFirstname(customer?.name),
    amount: formatInvoiceAmount(invoice.amount_due, invoice.currency, language),
    attemptDate: formatBillingDate(invoice.created, language),
    nextRetryDate: invoice.next_payment_attempt
      ? formatBillingDate(invoice.next_payment_attempt, language)
      : '',
    planName,
    planBenefits: getPlanBenefits(planName, language),
    updateCardLink: buildUpdateCardLink(account),
    hostedInvoiceUrl: invoice.hosted_invoice_url || '',
    loginUrl: process.env.GLADYS_PLUS_FRONTEND_URL,
  };
}

async function hasRecentPaymentFailedEmail(db, accountId) {
  const twentyFourHoursAgo = new Date(Date.now() - ONE_DAY_IN_MS);
  const recent = await db.query(
    `SELECT id FROM t_account_payment_activity
     WHERE account_id = $1
       AND stripe_event = 'invoice.payment_failed'
       AND created_at > $2
       AND is_deleted = false
     LIMIT 1`,
    [accountId, twentyFourHoursAgo],
  );

  return recent.length > 0;
}

module.exports = {
  buildPaymentFailedScope,
  buildTrialWillEndScope,
  extractFirstname,
  formatBillingDate,
  formatInvoiceAmount,
  formatPrice,
  getPlanBenefits,
  getPlanName,
  hasRecentPaymentFailedEmail,
};
