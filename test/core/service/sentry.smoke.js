/**
 * Sentry smoke test, run in its own process by sentry.test.js:
 * the SDK must be initialized before Express is loaded, and the main mocha
 * process boots the whole gateway (and Express) without a Sentry client.
 *
 * Prints, as JSON on stdout, the exception messages (and the user attached to them)
 * that reached the transport.
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
const asyncMiddleware = require('../../../core/middleware/asyncMiddleware');
const { mapUpstreamError, UPSTREAM_ERROR_METRIC } = require('../../../core/service/upstreamError');

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

function exceptionEventsFromEnvelope(envelope) {
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
    .filter((item) => item && item.exception && item.exception.values);
}

function exceptionMessagesFromEnvelope(envelope) {
  return exceptionEventsFromEnvelope(envelope).flatMap((item) =>
    item.exception.values.map((exception) => exception.value),
  );
}

function usersFromEnvelope(envelope) {
  return exceptionEventsFromEnvelope(envelope).map((item) => item.user || null);
}

function metricsFromEnvelope(envelope) {
  return envelope
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter((item) => item && Array.isArray(item.items))
    .flatMap((item) => item.items)
    .filter((metric) => metric.name === UPSTREAM_ERROR_METRIC)
    .map((metric) => ({
      type: metric.type,
      value: metric.value,
      service: metric.attributes.service && metric.attributes.service.value,
      reason: metric.attributes.reason && metric.attributes.reason.value,
      upstream_status: metric.attributes.upstream_status && metric.attributes.upstream_status.value,
    }));
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
  // what the auth middlewares (and openApiApiKeyAuth, with the whole profile) set
  const fakeAuth = asyncMiddleware(async (req, res, next) => {
    req.user = { id: 'user-id', email: 'tony.stark@gladysassistant.com', name: 'Tony' };
    next();
  });
  app.get('/unexpected-authenticated', fakeAuth, () => {
    throw new Error('unexpected authenticated boom');
  });
  app.get('/upstream-timeout', () => {
    // what axios throws when the AI service answers 504
    const axiosError = new Error('Request failed with status code 504');
    axiosError.isAxiosError = true;
    axiosError.code = 'ERR_BAD_RESPONSE';
    axiosError.config = { method: 'post', url: 'https://ai.example.com' };
    axiosError.response = { status: 504, statusText: 'Gateway Timeout', data: 'timed out' };
    throw mapUpstreamError('openai_ask', axiosError, 'AI service');
  });
  app.use(sentryService.setUserErrorHandler);
  Sentry.setupExpressErrorHandler(app);
  app.use(ErrorMiddleware(silentLogger));

  const server = app.listen(0);
  const { port } = server.address();
  const statuses = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const route of [
    '/validation-error',
    '/unauthorized',
    '/not-found',
    '/unexpected',
    '/unexpected-authenticated',
    '/upstream-timeout',
  ]) {
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
      users: captured.flatMap(usersFromEnvelope),
      metrics: captured.flatMap(metricsFromEnvelope),
    }),
  );
  await Sentry.close(1000);
  process.exit(0);
})().catch((e) => {
  process.stderr.write(e.stack);
  process.exit(1);
});
