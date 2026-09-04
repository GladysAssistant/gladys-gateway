const Sentry = require('@sentry/node');
const beforeSendSentry = require('./beforeSendSentry');
const { shouldReportErrorToSentry } = require('../middleware/errorMiddleware');

/**
 * Initialize Sentry. Must be called before Express / http are required so the
 * SDK can instrument them (see index.js).
 * Without a SENTRY_DSN the SDK stays disabled and every call is a no-op.
 *
 * @param {object} [overrides] extra Sentry options (used by tests to inject a fake transport)
 */
function init(overrides = {}) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    beforeSend: beforeSendSentry,
    ignoreErrors: ['Unauthorized', 'Forbidden', 'NO_INSTANCE_FOUND'],
    // Never send user identity data (IP address, ...) by default
    sendDefaultPii: false,
    integrations: [
      // Only capture unexpected errors: expected client errors (4xx raised on purpose)
      // are already handled by the error middleware and would only pollute Sentry.
      // This is read back by the error handler registered with `setupExpressErrorHandler`.
      Sentry.expressIntegration({ shouldHandleError: shouldReportErrorToSentry }),
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
    ...overrides,
  });
}

module.exports = { init };
