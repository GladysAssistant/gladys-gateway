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
} = require('../common/error');

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

function isExpectedClientError(error) {
  return EXPECTED_CLIENT_ERRORS.some((ErrorClass) => error instanceof ErrorClass);
}

/**
 * Sentry should only receive errors that are actual bugs.
 * Expected client errors (4xx we raise on purpose: 400, 401, 402, 403, 404, 409, 422, 429)
 * are handled by the error middleware and must not be reported.
 */
function shouldReportErrorToSentry(error) {
  if (isExpectedClientError(error)) {
    return false;
  }
  // generic 404 raised by third-party middlewares (e.g. express static / proxy)
  if (error && (error.status === 404 || error.statusCode === 404)) {
    return false;
  }
  return true;
}

function isAxiosError(error) {
  return Boolean(error && (error.isAxiosError === true || error.name === 'AxiosError'));
}

function formatRequestContext(req) {
  const method = req.method || '?';
  const path = (req.route && req.route.path) || req.originalUrl || req.url || '?';
  const userId = req.user && req.user.id ? req.user.id : '—';
  return `${method} ${path} user=${userId}`;
}

function summarizeResponseData(data) {
  if (data == null) {
    return '';
  }
  if (typeof data === 'string') {
    return data.slice(0, 200);
  }
  if (typeof data.error === 'string') {
    return data.error.slice(0, 200);
  }
  if (data.error && data.error.message) {
    return String(data.error.message).slice(0, 200);
  }
  if (data.message) {
    return String(data.message).slice(0, 200);
  }
  try {
    return JSON.stringify(data).slice(0, 200);
  } catch (e) {
    return '';
  }
}

function formatAxiosError(error) {
  const method = ((error.config && error.config.method) || '?').toUpperCase();
  const url = (error.config && error.config.url) || '?';
  const status = (error.response && error.response.status) || error.code || '?';
  const statusText = (error.response && error.response.statusText) || '';
  const detail = summarizeResponseData(error.response && error.response.data);
  const statusPart = statusText ? `${status} ${statusText}` : String(status);
  return `Axios ${method} ${url} → ${statusPart}${detail ? ` — ${detail}` : ''}`;
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

    if (isExpectedClientError(error)) {
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
module.exports.isExpectedClientError = isExpectedClientError;
module.exports.shouldReportErrorToSentry = shouldReportErrorToSentry;
