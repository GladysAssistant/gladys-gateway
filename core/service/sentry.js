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
      // headers (Authorization, Stripe signature), cookies and the client IP are never
      // sent to Sentry, the body is kept for debugging but scrubbed by beforeSendSentry.
      // The user is not read from the request by the SDK: only the user id is attached,
      // by `setUserErrorHandler`.
      Sentry.requestDataIntegration({
        include: {
          cookies: false,
          headers: false,
          ip: false,
          data: true,
          query_string: true,
          url: true,
        },
      }),
    ],
    ...overrides,
  });
}

/**
 * Express error handler to register right before `Sentry.setupExpressErrorHandler`:
 * attaches the id of the authenticated user (and only the id, never the email or
 * the rest of the profile) to the Sentry scope of the current request, so an issue
 * can still be linked to an account without sending personal data.
 */
function setUserErrorHandler(error, req, res, next) {
  if (req.user && req.user.id) {
    Sentry.setUser({ id: req.user.id });
  }
  next(error);
}

module.exports = { init, setUserErrorHandler };
