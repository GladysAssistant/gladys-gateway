/* eslint-disable no-console */
// Checks that the Mondial Relay Web Service credentials of the .env file are valid:
//   npm run check-mondial-relay
// It calls the tracking method with a dummy parcel number and interprets the STAT code.
require('dotenv').config();

const MondialRelayService = require('../core/service/mondial-relay');

const logger = { info() {}, warn() {}, debug() {}, error() {} };

// STAT codes proving the credentials were accepted (the dummy parcel simply does not exist)
const AUTHENTICATED_STATS = ['0', '24', '80', '81', '82', '83', '94'];
const HINTS = {
  1: 'MONDIAL_RELAY_ENSEIGNE is not a known "code enseigne" (8 characters, e.g. BDTEST13).',
  2: 'MONDIAL_RELAY_ENSEIGNE is empty or unknown.',
  3: 'MONDIAL_RELAY_ENSEIGNE is not a valid account number.',
  69: 'MONDIAL_RELAY_ENSEIGNE is invalid.',
  95: 'The Web Service is not enabled on this account: ask Mondial Relay support (servicesupport@mondialrelay.fr) to activate the API access of your Connect Pro account.',
  97: 'MONDIAL_RELAY_PRIVATE_KEY is wrong ("clé privée" in Mon profil > Mes paramètres de connexion).',
};

async function main() {
  const service = MondialRelayService(logger);
  if (!service.isConfigured()) {
    console.error('MONDIAL_RELAY_ENSEIGNE and MONDIAL_RELAY_PRIVATE_KEY must be set in the environment (.env).');
    process.exit(1);
  }
  console.log(`Enseigne: ${process.env.MONDIAL_RELAY_ENSEIGNE}`);
  console.log(`Widget brand code: ${service.getWidgetBrandCode()}`);
  try {
    const tracking = await service.getTracking('00000000', 'fr');
    console.log(`✅ Credentials accepted (STAT=${tracking.stat}: ${tracking.status}).`);
  } catch (e) {
    if (e.stat && AUTHENTICATED_STATS.includes(e.stat)) {
      console.log(`✅ Credentials accepted (STAT=${e.stat}: ${e.statMessage}, expected for a dummy parcel number).`);
      return;
    }
    if (e.stat) {
      console.error(`❌ STAT=${e.stat}: ${e.statMessage}`);
      if (HINTS[e.stat]) {
        console.error(`   ${HINTS[e.stat]}`);
      }
      process.exit(1);
    }
    console.error(`❌ Unable to reach the Mondial Relay Web Service: ${e.message}`);
    process.exit(1);
  }
}

main();
