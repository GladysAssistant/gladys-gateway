const express = require('express');

const { buildWelcomeReminderScope, buildWelcomeScope } = require('./billing-email-scope');
const { LOGO_CONTENT_ID, LOGO_PATH } = require('./email-logo');
const templates = require('./email');

const app = express();

const LANGUAGES = ['fr', 'en'];

/**
 * Sample data covering every variable used by the templates, so `npm run
 * start-email-preview` renders each email exactly as a customer would receive it.
 */
function buildPreviewScope(templateName, language) {
  const isFr = language === 'fr';

  const welcomeScope = buildWelcomeScope({
    confirmationUrlGladys4: 'http://gladysassistant.com/signup',
    customer: { name: 'Tony Stark' },
    subscription: {
      trial_end: Math.floor(new Date('2026-07-25T12:00:00Z').getTime() / 1000),
    },
    plan: 'plus',
    language,
  });

  const welcomeReminderScope = buildWelcomeReminderScope({
    confirmationUrlGladys4: 'http://gladysassistant.com/signup',
    customer: { name: 'Tony Stark' },
    account: {
      plan: 'plus',
      status: 'trialing',
      created_at: new Date('2026-06-18T12:00:00Z'),
      current_period_end: new Date('2026-07-25T12:00:00Z'),
    },
    language,
  });

  return {
    confirmationUrlGladys4: 'http://gladysassistant.com',
    nameOfAdminInviting: 'Tony',
    invitationUrlGladys4: 'http://gladysassistant.com',
    resetPasswordUrlGladys4: 'http://gladysassistant.com',
    newEmail: 'new-email@gladysassistant.com',
    updateCardLink: 'http://gladysassistant.com',
    loginUrl: 'http://gladysassistant.com',
    firstname: 'Tony',
    trialEndDate: isFr ? '25 juin 2026' : '25 June 2026',
    amount: isFr ? '9,99 €/mois' : '€9.99/month',
    planName: 'Plus',
    planBenefits: isFr
      ? ['Sauvegardes quotidiennes chiffrées', 'Streaming caméra à distance', 'Intégrations avancées (IA, Enedis, MCP)']
      : ['Daily encrypted backups', 'Remote camera streaming', 'Advanced integrations (AI, Enedis, MCP)'],
    renewalDate: isFr ? '25 juin 2026' : '25 June 2026',
    manageSubscriptionLink: 'http://gladysassistant.com',
    attemptDate: isFr ? '22 juin 2026' : '22 June 2026',
    nextRetryDate: isFr ? '25 juin 2026' : '25 June 2026',
    hostedInvoiceUrl: 'https://invoice.stripe.com/example',
    deletionDate: isFr ? '7 octobre 2026' : '7 October 2026',
    accessEndedDate: isFr ? '2 juin 2025' : '2 June 2025',
    planProductName: 'Gladys Plus',
    subscribeUrl: 'https://gladysassistant.com/fr/plus',
    recoveryCodesUrl: 'http://gladysassistant.com/dashboard/settings/security',
    instanceName: 'Raspberry Pi',
    offlineFor: '2 h 15 min',
    lastSeenDate: isFr ? '7 septembre 2026 à 14:05 UTC' : '7 September 2026 at 14:05 UTC',
    alertDelay: '1 h',
    downtime: '3 h 40 min',
    ...welcomeScope,
    ...(templateName === 'welcome_reminder' ? welcomeReminderScope : {}),
  };
}

// Index listing every template, so there is no need to remember their names
app.get('/', (req, res) => {
  const rows = Object.keys(templates)
    .sort()
    .map((name) => {
      const links = LANGUAGES.filter((language) => templates[name][language])
        .map((language) => `<a href="/${name}/${language}">${language}</a>`)
        .join(' · ');
      return `<li><code>${name}</code> &nbsp; ${links}</li>`;
    })
    .join('\n');

  res.send(
    `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Gladys Plus email preview</title></head>
     <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 32px; line-height: 2;">
       <h1>Gladys Plus email preview</h1>
       <ul>${rows}</ul>
     </body></html>`,
  );
});

// A browser knows nothing about cid:, so the preview serves the logo over HTTP instead
app.get('/logo.png', (req, res) => {
  res.sendFile(LOGO_PATH);
});

app.get('/:template_name/:language', (req, res) => {
  const { template_name: templateName, language } = req.params;

  if (!templates[templateName] || !templates[templateName][language]) {
    res.status(404).send('Unknown template or language. See <a href="/">the index</a>.');
    return;
  }

  const html = templates[templateName][language].ejs(buildPreviewScope(templateName, language));

  res.send(html.replace(`cid:${LOGO_CONTENT_ID}`, '/logo.png'));
});

app.listen(3000, () => {
  console.log('Email preview listening on http://localhost:3000');
});
