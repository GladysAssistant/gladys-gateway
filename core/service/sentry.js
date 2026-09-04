const Sentry = require('@sentry/node');
const beforeSendSentry = require('./beforeSendSentry');

/**
 * Initialize Sentry. Must be called before Express / http are required so the
 * SDK can instrument them (see index.js).
 * Without a SENTRY_DSN the SDK stays disabled and every call is a no-op.
 */
function init() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    beforeSend: beforeSendSentry,
    ignoreErrors: ['Unauthorized', 'Forbidden', 'NO_INSTANCE_FOUND'],
    // Never send user identity data (IP address, ...) by default
    sendDefaultPii: false,
    integrations: [
      // headers (Authorization, Stripe signature) and cookies are never sent to Sentry,
      // the body is kept for debugging but scrubbed by beforeSendSentry
      Sentry.requestDataIntegration({
        include: {
          cookies: false,
          headers: false,
          ip: false,
          user: false,
          data: true,
          query_string: true,
          url: true,
        },
      }),
    ],
  });
}

module.exports = { init };
