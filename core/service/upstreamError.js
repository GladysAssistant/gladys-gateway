const Sentry = require('@sentry/node');
const { BadGatewayError, GatewayTimeoutError } = require('../common/error');

// Name of the Sentry counter incremented for every upstream failure.
// Attributes: service (which upstream), reason (timeout / http_error / network),
// upstream_status (HTTP status when the upstream answered), upstream_code (axios / node error code).
const UPSTREAM_ERROR_METRIC = 'gateway.upstream_error';

// axios / node error codes that mean "no answer in time"
const TIMEOUT_CODES = ['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'];

function isAxiosError(error) {
  return Boolean(error && (error.isAxiosError === true || error.name === 'AxiosError'));
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

/**
 * One compact line describing an axios failure: method, url, status / code and a
 * short summary of the response body. Never dumps the request config (headers, tokens, body).
 */
function formatAxiosError(error) {
  const method = ((error.config && error.config.method) || '?').toUpperCase();
  const url = (error.config && error.config.url) || '?';
  const status = (error.response && error.response.status) || error.code || '?';
  const statusText = (error.response && error.response.statusText) || '';
  const detail = summarizeResponseData(error.response && error.response.data);
  const statusPart = statusText ? `${status} ${statusText}` : String(status);
  return `Axios ${method} ${url} → ${statusPart}${detail ? ` — ${detail}` : ''}`;
}

function isUpstreamTimeout(error) {
  if (TIMEOUT_CODES.includes(error.code)) {
    return true;
  }
  const status = error.response && error.response.status;
  return status === 504 || status === 408;
}

function getUpstreamReason(error) {
  if (isUpstreamTimeout(error)) {
    return 'timeout';
  }
  if (error.response && error.response.status) {
    return 'http_error';
  }
  return 'network';
}

/**
 * Count an upstream failure in Sentry instead of reporting it as an exception:
 * these failures are operational (the upstream is slow or down), not bugs, and
 * a counter is what we need to watch them.
 * Attribute values must be primitives for Sentry.
 */
function countUpstreamError(service, error, reason) {
  const attributes = {
    service,
    reason,
    upstream_status: (error.response && error.response.status) || 0,
    upstream_code: error.code || '',
  };
  try {
    Sentry.metrics.count(UPSTREAM_ERROR_METRIC, 1, { attributes });
  } catch (e) {
    // counting must never break the request handling
  }
}

/**
 * Convert an axios failure on a call to an upstream service into a clean
 * 504 (timeout) or 502 (any other upstream failure) error, and count it in Sentry.
 * Non-axios errors are returned untouched: they are real bugs and must still reach Sentry.
 *
 * @param {string} service short identifier of the upstream (e.g. 'openai_ask'), used as metric attribute
 * @param {Error} error the error thrown by axios
 * @param {string} [serviceLabel] human readable name used in the message sent back to the client
 * @returns {Error} the error to throw
 */
function mapUpstreamError(service, error, serviceLabel = 'Upstream service') {
  if (!isAxiosError(error)) {
    return error;
  }
  const reason = getUpstreamReason(error);
  countUpstreamError(service, error, reason);
  const upstream = formatAxiosError(error);
  if (reason === 'timeout') {
    return new GatewayTimeoutError(`${serviceLabel} did not answer in time`, upstream);
  }
  if (reason === 'http_error') {
    return new BadGatewayError(`${serviceLabel} returned an error`, upstream);
  }
  return new BadGatewayError(`${serviceLabel} is unreachable`, upstream);
}

module.exports = {
  UPSTREAM_ERROR_METRIC,
  isAxiosError,
  summarizeResponseData,
  formatAxiosError,
  isUpstreamTimeout,
  getUpstreamReason,
  countUpstreamError,
  mapUpstreamError,
};
