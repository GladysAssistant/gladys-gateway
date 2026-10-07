/* eslint-disable no-console */
// Checks that the Mondial Relay credentials of the .env file are valid:
//   npm run check-mondial-relay
//   npm run check-mondial-relay -- 12345678
//
// Mondial Relay exposes two APIs with two different sets of credentials, and this script checks
// both of them:
//   - API1 (SOAP), used here to track parcels. Checked by tracking a parcel number and reading
//     the STAT code. Tracing is NOT available on the test account, so this check needs the
//     credentials of the production account, and ideally the number of a real shipment passed
//     as an argument.
//   - API2 (REST), used here to create the shipments and their labels. Checked by sending a
//     request that contains no shipment: valid credentials answer with the business error 10011,
//     wrong ones with an authentication error. Nothing is ever created.
require('dotenv').config();

const MondialRelayService = require('../core/service/mondial-relay');

const logger = { info() {}, warn() {}, debug() {}, error() {} };

// STAT codes proving the credentials were accepted (the parcel simply does not exist, or is
// not visible from this account)
const AUTHENTICATED_STATS = ['0', '24', '80', '81', '82', '83', '94'];
const HINTS = {
  1: 'MONDIAL_RELAY_ENSEIGNE is not a known "code enseigne" (8 characters).',
  2: 'MONDIAL_RELAY_ENSEIGNE is empty or unknown.',
  3: 'MONDIAL_RELAY_ENSEIGNE is not a valid account number.',
  69: 'MONDIAL_RELAY_ENSEIGNE is invalid.',
  93: 'No result from the sorting plan: the shipment number is probably not one of this account.',
  95: 'The tracing method is not enabled on this account. It is never available on the test account (TTMRSDBX): use the credentials of the production account.',
  97: 'MONDIAL_RELAY_PRIVATE_KEY is wrong ("clé privée" in Connect > "Mes paramètres de connexion").',
};
const SHIPMENT_API_HINTS = {
  10000: 'MONDIAL_RELAY_API2_LOGIN or MONDIAL_RELAY_API2_PASSWORD is missing or malformed.',
  10001:
    'MONDIAL_RELAY_API2_LOGIN / MONDIAL_RELAY_API2_PASSWORD rejected. These are the API2 credentials generated in Connect > Administration > "Configuration des API" > "API Version V2.0", not the API1 code enseigne and clé privée.',
  10002: 'MONDIAL_RELAY_API2_CUSTOMER_ID is missing or malformed (8 characters).',
  10005: 'MONDIAL_RELAY_API2_CUSTOMER_ID is unknown to Mondial Relay.',
  10006: 'MONDIAL_RELAY_API2_CULTURE is unknown (expected something like fr-FR).',
  10066: 'This account has no access right on API2: ask Mondial Relay to enable it.',
  10067: 'No API2 configuration for this account: ask Mondial Relay to set it up.',
};

async function checkTracking(service, shipmentNumber) {
  console.log('\n— API1 (SOAP), parcel tracking —');
  if (!service.isConfigured()) {
    console.log('⏭  Skipped: MONDIAL_RELAY_ENSEIGNE and MONDIAL_RELAY_PRIVATE_KEY are not set.');
    return true;
  }
  console.log(`Enseigne: ${process.env.MONDIAL_RELAY_ENSEIGNE}`);
  console.log(`Widget brand code: ${service.getWidgetBrandCode()}`);
  console.log(`Shipment number: ${shipmentNumber}`);
  try {
    const tracking = await service.getTracking(shipmentNumber, 'fr');
    console.log(`✅ Credentials accepted (STAT=${tracking.stat}: ${tracking.status}).`);
    return true;
  } catch (e) {
    if (e.stat && AUTHENTICATED_STATS.includes(e.stat)) {
      console.log(`✅ Credentials accepted (STAT=${e.stat}: ${e.statMessage}).`);
      return true;
    }
    if (e.stat) {
      console.error(`❌ STAT=${e.stat}: ${e.statMessage}`);
      if (HINTS[e.stat]) {
        console.error(`   ${HINTS[e.stat]}`);
      }
      return false;
    }
    console.error(`❌ Unable to reach the Mondial Relay Web Service: ${e.message}`);
    return false;
  }
}

async function checkShipmentApi(service) {
  console.log('\n— API2 (REST), shipment and label creation —');
  if (!service.isShipmentApiConfigured()) {
    console.log('⏭  Skipped: MONDIAL_RELAY_API2_LOGIN, MONDIAL_RELAY_API2_PASSWORD are not set.');
    return true;
  }
  console.log(`Login: ${process.env.MONDIAL_RELAY_API2_LOGIN}`);
  console.log(`Customer id: ${process.env.MONDIAL_RELAY_API2_CUSTOMER_ID || process.env.MONDIAL_RELAY_ENSEIGNE}`);
  console.log(`Sandbox: ${process.env.MONDIAL_RELAY_API2_SANDBOX === 'true' ? 'yes' : 'no'}`);
  try {
    const result = await service.checkShipmentApiCredentials();
    if (result.ok) {
      console.log(`✅ Credentials accepted (the empty request was rejected with ${result.code}, as expected).`);
      return true;
    }
    console.error(`❌ Error ${result.code}: ${result.message}`);
    if (SHIPMENT_API_HINTS[result.code]) {
      console.error(`   ${SHIPMENT_API_HINTS[result.code]}`);
    }
    return false;
  } catch (e) {
    console.error(`❌ Unable to reach the Mondial Relay shipment API: ${e.message}`);
    return false;
  }
}

async function main() {
  const service = MondialRelayService(logger);
  if (!service.isConfigured() && !service.isShipmentApiConfigured()) {
    console.error('No Mondial Relay credentials in the environment (.env). See the README.');
    process.exit(1);
  }
  // A real shipment number of the account gives the most meaningful answer; without one, a dummy
  // number still proves the credentials are accepted (the parcel is simply reported as unknown).
  const shipmentNumber = process.argv[2] || '00000000';
  const trackingOk = await checkTracking(service, shipmentNumber);
  const shipmentApiOk = await checkShipmentApi(service);
  if (!trackingOk || !shipmentApiOk) {
    process.exit(1);
  }
}

main();
