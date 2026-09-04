const { expect } = require('chai');
const Sentry = require('@sentry/node');
const {
  UPSTREAM_ERROR_METRIC,
  mapUpstreamError,
  getUpstreamReason,
  formatAxiosError,
} = require('../../../core/service/upstreamError');
const { BadGatewayError, GatewayTimeoutError } = require('../../../core/common/error');

function axiosError({ code, status, statusText, data } = {}) {
  const error = new Error(status ? `Request failed with status code ${status}` : code);
  error.isAxiosError = true;
  error.name = 'AxiosError';
  error.code = code;
  error.config = {
    method: 'post',
    url: 'https://open-ai.example.com',
    data: '{"question":"secret question"}',
    headers: { authorization: 'Bearer secret-token' },
  };
  if (status) {
    error.response = { status, statusText, data };
  }
  return error;
}

describe('upstreamError service', () => {
  let counted;
  let originalCount;

  beforeEach(() => {
    counted = [];
    originalCount = Sentry.metrics.count;
    Sentry.metrics.count = (name, value, options) => counted.push({ name, value, options });
  });

  afterEach(() => {
    Sentry.metrics.count = originalCount;
  });

  it('should map an upstream 504 to a GatewayTimeoutError and count it', () => {
    const error = mapUpstreamError(
      'openai_ask',
      axiosError({ code: 'ERR_BAD_RESPONSE', status: 504, statusText: 'Gateway Timeout', data: 'timed out' }),
      'AI service',
    );
    expect(error).to.be.instanceOf(GatewayTimeoutError);
    expect(error.getStatus()).to.equal(504);
    expect(error.jsonError()).to.deep.equal({
      status: 504,
      error_code: 'GATEWAY_TIMEOUT',
      error_message: 'AI service did not answer in time',
    });
    expect(error.upstream).to.equal('Axios POST https://open-ai.example.com → 504 Gateway Timeout — timed out');
    expect(counted).to.deep.equal([
      {
        name: UPSTREAM_ERROR_METRIC,
        value: 1,
        options: {
          attributes: {
            service: 'openai_ask',
            reason: 'timeout',
            upstream_status: 504,
            upstream_code: 'ERR_BAD_RESPONSE',
          },
        },
      },
    ]);
  });

  it('should map a client-side timeout (ECONNABORTED / ETIMEDOUT) to a GatewayTimeoutError', () => {
    ['ECONNABORTED', 'ETIMEDOUT'].forEach((code) => {
      const error = mapUpstreamError('openai_ask', axiosError({ code }));
      expect(error).to.be.instanceOf(GatewayTimeoutError);
      expect(error.errorMessage).to.equal('Upstream service did not answer in time');
    });
    expect(counted.map((c) => c.options.attributes)).to.deep.equal([
      { service: 'openai_ask', reason: 'timeout', upstream_status: 0, upstream_code: 'ECONNABORTED' },
      { service: 'openai_ask', reason: 'timeout', upstream_status: 0, upstream_code: 'ETIMEDOUT' },
    ]);
  });

  it('should map an upstream HTTP error (5xx or 4xx) to a BadGatewayError', () => {
    [500, 502, 503, 400, 429].forEach((status) => {
      const error = mapUpstreamError('openai_ask', axiosError({ code: 'ERR_BAD_RESPONSE', status }), 'AI service');
      expect(error).to.be.instanceOf(BadGatewayError);
      expect(error.getStatus()).to.equal(502);
      expect(error.jsonError()).to.deep.equal({
        status: 502,
        error_code: 'BAD_GATEWAY',
        error_message: 'AI service returned an error',
      });
    });
    expect(counted).to.have.lengthOf(5);
    expect(counted[0].options.attributes).to.deep.equal({
      service: 'openai_ask',
      reason: 'http_error',
      upstream_status: 500,
      upstream_code: 'ERR_BAD_RESPONSE',
    });
  });

  it('should map a network error (no response) to a BadGatewayError', () => {
    const error = mapUpstreamError('openai_ask', axiosError({ code: 'ECONNREFUSED' }), 'AI service');
    expect(error).to.be.instanceOf(BadGatewayError);
    expect(error.errorMessage).to.equal('AI service is unreachable');
    expect(counted[0].options.attributes).to.deep.equal({
      service: 'openai_ask',
      reason: 'network',
      upstream_status: 0,
      upstream_code: 'ECONNREFUSED',
    });
  });

  it('should never put the request body or the authorization header in the upstream detail', () => {
    const error = mapUpstreamError('openai_ask', axiosError({ code: 'ERR_BAD_RESPONSE', status: 500 }));
    expect(error.upstream).to.not.include('secret');
  });

  it('should return non-axios errors untouched and not count them', () => {
    const bug = new TypeError("Cannot read property 'x' of undefined");
    expect(mapUpstreamError('openai_ask', bug)).to.equal(bug);
    expect(mapUpstreamError('openai_ask', null)).to.equal(null);
    expect(counted).to.have.lengthOf(0);
  });

  it('should not fail when the Sentry counter throws', () => {
    Sentry.metrics.count = () => {
      throw new Error('sentry is broken');
    };
    const error = mapUpstreamError('openai_ask', axiosError({ code: 'ERR_BAD_RESPONSE', status: 504 }));
    expect(error).to.be.instanceOf(GatewayTimeoutError);
  });

  it('should classify reasons', () => {
    expect(getUpstreamReason(axiosError({ code: 'ERR_BAD_RESPONSE', status: 408 }))).to.equal('timeout');
    expect(getUpstreamReason(axiosError({ code: 'ERR_BAD_RESPONSE', status: 503 }))).to.equal('http_error');
    expect(getUpstreamReason(axiosError({ code: 'ENOTFOUND' }))).to.equal('network');
  });

  it('should format an axios error without a response', () => {
    expect(formatAxiosError(axiosError({ code: 'ECONNREFUSED' }))).to.equal(
      'Axios POST https://open-ai.example.com → ECONNREFUSED',
    );
  });
});
