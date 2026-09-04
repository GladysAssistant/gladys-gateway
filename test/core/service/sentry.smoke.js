/**
 * Sentry smoke test, run in its own process by sentry.test.js:
 * the SDK must be initialized before Express is loaded, and the main mocha
 * process boots the whole gateway (and Express) without a Sentry client.
 *
 * Prints, as JSON on stdout, the exception messages that reached the transport.
 */
process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';

const Sentry = require('@sentry/node');
const sentryService = require('../../../core/service/sentry');

const captured = [];

sentryService.init({
  // fake transport: keep the envelopes in memory instead of sending them
  transport: (options) =>
    Sentry.createTransport(options, async (request) => {
      captured.push(request.body.toString());
      return { statusCode: 200 };
    }),
});

// Express and the gateway code are loaded after Sentry.init, like in index.js
// eslint-disable-next-line import/order
const express = require('express');
const { ValidationError, UnauthorizedError, NotFoundError } = require('../../../core/common/error');
const ErrorMiddleware = require('../../../core/middleware/errorMiddleware');

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

function exceptionMessagesFromEnvelope(envelope) {
  // an envelope is a list of JSON documents separated by newlines
  return envelope
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter((item) => item && item.exception && item.exception.values)
    .flatMap((item) => item.exception.values.map((exception) => exception.value));
}

(async () => {
  const app = express();
  app.get('/validation-error', () => {
    throw new ValidationError('user', { details: [] });
  });
  app.get('/unauthorized', () => {
    throw new UnauthorizedError('Unauthorized');
  });
  app.get('/not-found', () => {
    throw new NotFoundError('Route not found');
  });
  app.get('/unexpected', () => {
    throw new Error('unexpected boom');
  });
  Sentry.setupExpressErrorHandler(app);
  app.use(ErrorMiddleware(silentLogger));

  const server = app.listen(0);
  const { port } = server.address();
  const statuses = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const route of ['/validation-error', '/unauthorized', '/not-found', '/unexpected']) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    statuses[route] = response.status;
  }
  await Sentry.flush(2000);
  server.close();

  process.stdout.write(
    JSON.stringify({
      statuses,
      captured: captured.flatMap(exceptionMessagesFromEnvelope),
    }),
  );
  await Sentry.close(1000);
  process.exit(0);
})().catch((e) => {
  process.stderr.write(e.stack);
  process.exit(1);
});
