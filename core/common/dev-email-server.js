const express = require('express');

const { buildWelcomeScope } = require('./billing-email-scope');
const templates = require('./email');

const app = express();

app.get('/:template_name/:language', (req, res) => {
  const welcomeScope = buildWelcomeScope({
    confirmationUrlGladys4: 'http://gladysassistant.com/signup',
    customer: { name: 'Tony Stark' },
    subscription: {
      trial_end: Math.floor(new Date('2026-07-25T12:00:00Z').getTime() / 1000),
    },
    plan: 'plus',
    language: req.params.language,
  });

  res.send(
    templates[req.params.template_name][req.params.language].ejs({
      confirmationUrlGladys4: 'http://gladysassistant.com',
      nameOfAdminInviting: 'Tony',
      invitationUrlGladys4: 'http://gladysassistant.com',
      resetPasswordUrlGladys4: 'http://gladysassistant.com',
      newEmail: 'new-email@gladysassistant.com',
      updateCardLink: 'http://gladysassistant.com',
      loginUrl: 'http://gladysassistant.com',
      firstname: 'Tony',
      trialEndDate: '25 juin 2026',
      amount: '9,99 €/mois',
      planName: 'Plus',
      planBenefits: [
        'Sauvegardes quotidiennes chiffrées',
        'Streaming caméra à distance',
        'Intégrations avancées (IA, Enedis, MCP)',
      ],
      renewalDate: '25 juin 2026',
      manageSubscriptionLink: 'http://gladysassistant.com',
      attemptDate: '22 juin 2026',
      nextRetryDate: '25 juin 2026',
      hostedInvoiceUrl: 'https://invoice.stripe.com/example',
      deletionDate: '7 octobre 2026',
      accessEndedDate: '2 juin 2025',
      planProductName: 'Gladys Plus',
      subscribeUrl: 'https://gladysassistant.com/fr/plus',
      instanceName: 'Raspberry Pi',
      offlineFor: '2 h 15 min',
      lastSeenDate: '7 septembre 2026 à 14:05 UTC',
      alertDelay: '1 h',
      downtime: '3 h 40 min',
      ...welcomeScope,
    }),
  );
});

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});
