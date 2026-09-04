const omitDeep = require('omit-deep');

// Anything that is a credential, a proof, an encrypted key or a location is
// stripped from the event before it leaves the server, wherever it appears
// (request body, headers, extra context...)
const PROPERTIES_TO_OMIT = [
  // credentials & tokens
  'password',
  'authorization',
  'cookie',
  'cookies',
  'token',
  'access_token',
  'refresh_token',
  'two_factor_token',
  'two_factor_code',
  'two_factor_secret',
  'two_factor_recovery_code',
  'recovery_codes',
  'email_confirmation_token',
  'api_key',
  'client_secret',
  'code',
  'stripe-signature',
  'stripe_source_id',
  'stripe_portal_key',
  'stream_access_key',
  'tts_token',
  // SRP login material
  'srp_salt',
  'srp_verifier',
  'client_ephemeral_public',
  'client_session_proof',
  'server_session_proof',
  'login_session_key',
  // encrypted user keys
  'rsa_encrypted_private_key',
  'ecdsa_encrypted_private_key',
  'encrypted_backup_key',
  // Alexa/Google payloads carry the gateway bearer token in there
  'scope',
  'grant',
  // location data
  'latitude',
  'longitude',
  'accuracy',
  'altitude',
  'device_battery',
  'lon',
  'lat',
  'acc',
  'alt',
  'batt',
];

function beforeSend(event) {
  return omitDeep(event, PROPERTIES_TO_OMIT);
}

module.exports = beforeSend;
