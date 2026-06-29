const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const { normalizeLanguage } = require('./language');

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
      ? ['Accès à distance chiffré de bout en bout', 'Google Home et Amazon Alexa', 'Comptes pour toute la famille']
      : ['End-to-end encrypted remote access', 'Google Home & Amazon Alexa', 'Family accounts included'];
  }

  return language === 'fr'
    ? ['Sauvegardes quotidiennes chiffrées', 'Streaming caméra à distance', 'Intégrations avancées (IA, Enedis, MCP)']
    : ['Daily encrypted backups', 'Remote camera streaming', 'Advanced integrations (AI, Enedis, MCP)'];
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

function getWelcomeSteps(planName, language) {
  const isFr = language === 'fr';
  const owntracksUrl = isFr
    ? 'https://gladysassistant.com/fr/docs/integrations/owntracks'
    : 'https://gladysassistant.com/docs/integrations/owntracks';
  const openapiUrl = isFr
    ? 'https://gladysassistant.com/fr/docs/plus/open-api'
    : 'https://gladysassistant.com/docs/plus/open-api';

  const steps = isFr
    ? [
        'Active ton compte Gladys Plus avec le bouton ci-dessous.',
        'Connecte ton instance Gladys locale à Gladys Plus.',
        "Essaie d'accéder à ton instance depuis ton téléphone.",
      ]
    : [
        'Activate your Gladys Plus account using the button below.',
        'Connect your local Gladys instance to Gladys Plus.',
        'Try accessing your instance from your phone.',
      ];

  if (planName === 'Plus') {
    steps.push(
      isFr
        ? 'Vérifie que les sauvegardes fonctionnent (Paramètres → Sauvegardes). Tu peux lancer une sauvegarde manuelle pour tester.'
        : 'Verify your backups are working (Settings → Backups). You can trigger a manual backup to test.',
    );
    steps.push(
      isFr
        ? "Essaie de discuter avec l'agent IA dans le chat, ou utilise l'action « Demander à l'IA » dans les scènes pour automatiser tes actions avec l'IA."
        : 'Try chatting with the AI agent in the chat, or use the "Ask AI" action in scenes to automate your actions with AI.',
    );
  }

  steps.push(
    isFr
      ? "Invite les membres de ta famille (Paramètres → Utilisateurs Plus). Autant d'utilisateurs que tu veux, c'est inclus !"
      : "Invite family members (Settings → Plus Users). As many users as you want, it's included!",
  );

  steps.push(
    isFr
      ? `Configure OwnTracks sur ton téléphone pour les scènes GPS (<a href="${owntracksUrl}">voir la doc</a>).`
      : `Set up OwnTracks on your phone for GPS scenes (<a href="${owntracksUrl}">read the docs</a>).`,
  );

  steps.push(
    isFr
      ? `Découvre l'OpenAPI Gladys Plus (<a href="${openapiUrl}">voir la doc</a>).`
      : `Explore the Gladys Plus OpenAPI (<a href="${openapiUrl}">see the docs</a>).`,
  );

  return steps;
}

function getPlanProductName(planName) {
  return planName === 'Lite' ? 'Gladys Plus Lite' : 'Gladys Plus';
}

function buildWelcomeScope({ confirmationUrlGladys4, customer, subscription, plan, language }) {
  const normalizedLanguage = normalizeLanguage(language);
  const planName = plan === 'lite' ? 'Lite' : 'Plus';
  const hasTrial = !!(subscription?.trial_end && subscription.trial_end * 1000 > Date.now());

  return {
    confirmationUrlGladys4,
    firstname: extractFirstname(customer?.name),
    planName,
    planProductName: getPlanProductName(planName),
    welcomeSteps: getWelcomeSteps(planName, normalizedLanguage),
    hasTrial,
    trialEndDate: hasTrial ? formatBillingDate(subscription.trial_end, normalizedLanguage) : '',
  };
}

function buildUpdateCardLink(account) {
  return `${process.env.GLADYS_PLUS_BACKEND_URL}/accounts/stripe_customer_portal/${account.stripe_portal_key}`;
}

function buildTrialWillEndScope({ subscription, customer, language, account }) {
  const normalizedLanguage = normalizeLanguage(language);
  const price = subscription.items?.data?.[0]?.price;
  const productId = price?.product;
  const planName = getPlanName(productId);

  return {
    firstname: extractFirstname(customer?.name),
    trialEndDate: formatBillingDate(subscription.trial_end, normalizedLanguage),
    amount: formatPrice(price?.unit_amount, price?.currency, price?.recurring?.interval, normalizedLanguage),
    planName,
    planBenefits: getPlanBenefits(planName, normalizedLanguage),
    updateCardLink: buildUpdateCardLink(account),
    loginUrl: process.env.GLADYS_PLUS_FRONTEND_URL,
  };
}

function buildPaymentFailedScope({ invoice, customer, language, account }) {
  const normalizedLanguage = normalizeLanguage(language);
  const planName = account.plan === 'lite' ? 'Lite' : 'Plus';

  return {
    firstname: extractFirstname(customer?.name),
    amount: formatInvoiceAmount(invoice.amount_due, invoice.currency, normalizedLanguage),
    attemptDate: formatBillingDate(invoice.created, normalizedLanguage),
    nextRetryDate: invoice.next_payment_attempt
      ? formatBillingDate(invoice.next_payment_attempt, normalizedLanguage)
      : '',
    planName,
    planBenefits: getPlanBenefits(planName, normalizedLanguage),
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
  buildWelcomeScope,
  extractFirstname,
  formatBillingDate,
  formatInvoiceAmount,
  formatPrice,
  getPlanBenefits,
  getPlanName,
  getPlanProductName,
  getWelcomeSteps,
  hasRecentPaymentFailedEmail,
};
