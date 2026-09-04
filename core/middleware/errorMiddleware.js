const {
  ValidationError,
  AlreadyExistError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  ServerError,
  PaymentRequiredError,
  BadRequestError,
  TooManyRequestsError,
  BadGatewayError,
  GatewayTimeoutError,
} = require('../common/error');
const { isAxiosError, formatAxiosError } = require('../service/upstreamError');

const EXPECTED_CLIENT_ERRORS = [
  ValidationError,
  AlreadyExistError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  BadRequestError,
  TooManyRequestsError,
  PaymentRequiredError,
];

// Upstream failures (AI provider down or slow) mapped to clean 502/504 by the
// controllers: operational, counted as Sentry metrics, never reported as exceptions.
const EXPECTED_UPSTREAM_ERRORS = [BadGatewayError, GatewayTimeoutError];

function isExpectedClientError(error) {
  return EXPECTED_CLIENT_ERRORS.some((ErrorClass) => error instanceof ErrorClass);
}

function isExpectedUpstreamError(error) {
  return EXPECTED_UPSTREAM_ERRORS.some((ErrorClass) => error instanceof ErrorClass);
}

/**
 * Sentry should only receive errors that are actual bugs.
 * Expected client errors (4xx we raise on purpose: 400, 401, 402, 403, 404, 409, 422, 429)
 * and expected upstream errors (502 / 504 when a third-party service fails, counted
 * as metrics instead) are handled by the error middleware and must not be reported.
 */
function shouldReportErrorToSentry(error) {
  if (isExpectedClientError(error) || isExpectedUpstreamError(error)) {
    return false;
  }
  // generic 404 raised by third-party middlewares (e.g. express static / proxy)
  if (error && (error.status === 404 || error.statusCode === 404)) {
    return false;
  }
  return true;
}

function formatRequestContext(req) {
  const method = req.method || '?';
  const path = (req.route && req.route.path) || req.originalUrl || req.url || '?';
  const userId = req.user && req.user.id ? req.user.id : '—';
  return `${method} ${path} user=${userId}`;
}

function formatUnexpectedError(error) {
  return `${error.name || 'Error'}: ${error.message}`;
}

function getErrorMiddleware(logger) {
  return function ErrorMiddleware(error, req, res, next) {
    const context = formatRequestContext(req);

    if (error instanceof UnauthorizedError) {
      // 401s are common (expired tokens) — skip logging
    } else if (isExpectedClientError(error)) {
      const code = error.code || (error.getStatus && error.getStatus()) || 400;
      const message = error.errorMessage || error.message || error.constructor.name;
      logger.warn(`${code} ${message} ${context}`);
    } else if (isExpectedUpstreamError(error)) {
      // Upstream failure already mapped to a clean 502/504: one warn line with the upstream detail
      const upstream = error.upstream ? ` (${error.upstream})` : '';
      logger.warn(`${error.getStatus()} ${error.errorMessage}${upstream} ${context}`);
    } else if (error && error.type === 'StripeCardError') {
      logger.warn(`402 ${error.message} ${context}`);
    } else if (error && error.statusCode === 404) {
      logger.warn(`404 Not Found ${context}`);
    } else if (isAxiosError(error)) {
      // Upstream HTTP failures: one compact line, never dump config/body/tokens
      logger.error(`${formatAxiosError(error)} ${context}`);
    } else {
      logger.error(`${formatUnexpectedError(error)} ${context}`);
      if (error && error.stack) {
        logger.error(error.stack);
      }
    }

    if (isExpectedClientError(error) || isExpectedUpstreamError(error)) {
      return res.status(error.getStatus()).json(error.jsonError());
    }

    // handle stripe error
    if (error && error.type === 'StripeCardError' && error.statusCode) {
      const paymentRequiredError = new PaymentRequiredError(error.message);
      return res.status(paymentRequiredError.getStatus()).json(paymentRequiredError.jsonError());
    }

    if (error && error.statusCode && error.statusCode === 404) {
      const notFoundError = new NotFoundError();
      return res.status(notFoundError.getStatus()).json(notFoundError.jsonError());
    }

    const serverError = new ServerError();
    return res.status(serverError.getStatus()).json(serverError.jsonError());
  };
}

module.exports = getErrorMiddleware;
module.exports.EXPECTED_CLIENT_ERRORS = EXPECTED_CLIENT_ERRORS;
module.exports.EXPECTED_UPSTREAM_ERRORS = EXPECTED_UPSTREAM_ERRORS;
module.exports.isExpectedClientError = isExpectedClientError;
module.exports.isExpectedUpstreamError = isExpectedUpstreamError;
module.exports.shouldReportErrorToSentry = shouldReportErrorToSentry;
