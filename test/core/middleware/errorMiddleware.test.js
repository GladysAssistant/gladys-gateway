const { expect } = require('chai');
const getErrorMiddleware = require('../../../core/middleware/errorMiddleware');
const {
  ValidationError,
  AlreadyExistError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  BadRequestError,
  TooManyRequestsError,
  PaymentRequiredError,
} = require('../../../core/common/error');

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function createLoggerSpy() {
  const calls = { warn: [], error: [], info: [], debug: [] };
  return {
    calls,
    warn: (...args) => calls.warn.push(args),
    error: (...args) => calls.error.push(args),
    info: (...args) => calls.info.push(args),
    debug: (...args) => calls.debug.push(args),
  };
}

describe('errorMiddleware', () => {
  it('should not log UnauthorizedError and return 401', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();
    const req = { method: 'GET', route: { path: '/users/me' }, user: { id: 'user-1' } };

    middleware(new UnauthorizedError(), req, res, () => {});

    expect(logger.calls.warn).to.have.length(0);
    expect(logger.calls.error).to.have.length(0);
    expect(res.statusCode).to.equal(401);
    expect(res.body.error_code).to.equal('UNAUTHORIZED');
  });

  it('should warn once for expected client errors without dumping a stack', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();
    const req = { method: 'POST', route: { path: '/instances/access-token' } };

    middleware(new ForbiddenError('Forbidden'), req, res, () => {});

    expect(logger.calls.warn).to.have.length(1);
    expect(logger.calls.warn[0][0]).to.equal('403 Forbidden POST /instances/access-token user=—');
    expect(logger.calls.error).to.have.length(0);
    expect(res.statusCode).to.equal(403);
  });

  it('should include the user id in the warn message when present', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();
    const req = {
      method: 'POST',
      route: { path: '/v1/api/owntracks/:open_api_key' },
      user: { id: 'user-42' },
    };

    middleware(new NotFoundError('NO_INSTANCE_FOUND'), req, res, () => {});

    expect(logger.calls.warn[0][0]).to.equal('404 NO_INSTANCE_FOUND POST /v1/api/owntracks/:open_api_key user=user-42');
    expect(res.statusCode).to.equal(404);
  });

  it('should handle ValidationError, AlreadyExistError, BadRequestError, TooManyRequestsError and PaymentRequiredError', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const req = { method: 'POST', originalUrl: '/test' };

    const cases = [
      { error: new ValidationError('user', { details: [] }), status: 422 },
      { error: new AlreadyExistError('user', 'a@b.c'), status: 409 },
      { error: new BadRequestError('bad'), status: 400 },
      { error: new TooManyRequestsError('slow down'), status: 429 },
      { error: new PaymentRequiredError('pay'), status: 402 },
    ];

    cases.forEach(({ error, status }) => {
      const res = createMockRes();
      middleware(error, req, res, () => {});
      expect(res.statusCode).to.equal(status);
      expect(logger.calls.warn.length).to.be.greaterThan(0);
    });
  });

  it('should fall back to originalUrl or url when route path is missing', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();

    middleware(new ForbiddenError(), { method: 'GET', originalUrl: '/from-original' }, res, () => {});
    expect(logger.calls.warn[0][0]).to.include('/from-original');

    const res2 = createMockRes();
    middleware(new ForbiddenError(), { method: 'GET', url: '/from-url' }, res2, () => {});
    expect(logger.calls.warn[1][0]).to.include('/from-url');
  });

  it('should warn for StripeCardError and return payment required', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();
    const req = { method: 'POST', route: { path: '/accounts/subscribe' }, user: { id: 'u1' } };
    const stripeError = { type: 'StripeCardError', message: 'card declined', statusCode: 402 };

    middleware(stripeError, req, res, () => {});

    expect(logger.calls.warn[0][0]).to.equal('402 card declined POST /accounts/subscribe user=u1');
    expect(res.statusCode).to.equal(402);
    expect(res.body.error_code).to.equal('PAYMENT_REQUIRED');
  });

  it('should warn for generic statusCode 404 errors', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();
    const req = { method: 'GET', route: { path: '/missing' } };

    middleware({ statusCode: 404, message: 'gone' }, req, res, () => {});

    expect(logger.calls.warn[0][0]).to.equal('404 Not Found GET /missing user=—');
    expect(res.statusCode).to.equal(404);
  });

  it('should log Axios errors as a compact single line without dumping the body', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();
    const req = { method: 'POST', route: { path: '/openai/ask' } };
    const axiosError = {
      isAxiosError: true,
      name: 'AxiosError',
      message: 'Request failed with status code 504',
      code: 'ERR_BAD_RESPONSE',
      config: {
        method: 'post',
        url: 'https://open-ai.example.com',
        data: '{"huge":"payload"}',
        headers: { authorization: 'Bearer secret-token' },
      },
      response: {
        status: 504,
        statusText: 'Gateway Timeout',
        data: { error: 'Scaleway request timed out' },
      },
    };

    middleware(axiosError, req, res, () => {});

    expect(logger.calls.error).to.have.length(1);
    expect(logger.calls.error[0][0]).to.equal(
      'Axios POST https://open-ai.example.com → 504 Gateway Timeout — Scaleway request timed out POST /openai/ask user=—',
    );
    expect(logger.calls.error[0][0]).to.not.include('secret-token');
    expect(logger.calls.error[0][0]).to.not.include('huge');
    expect(res.statusCode).to.equal(500);
  });

  it('should summarize Axios response data from string, message and nested error shapes', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const req = { method: 'GET', url: '/x' };

    const variants = [
      { data: 'plain text error', expected: 'plain text error' },
      { data: { message: 'top-level message' }, expected: 'top-level message' },
      { data: { error: { message: 'nested message' } }, expected: 'nested message' },
      { data: { foo: 'bar' }, expected: '{"foo":"bar"}' },
      { data: null, expected: null },
    ];

    variants.forEach(({ data, expected }, index) => {
      const res = createMockRes();
      middleware(
        {
          isAxiosError: true,
          config: { method: 'get', url: 'https://api.example.com' },
          response: { status: 400, statusText: 'Bad Request', data },
        },
        req,
        res,
        () => {},
      );
      if (expected) {
        expect(logger.calls.error[index][0]).to.include(expected);
      } else {
        expect(logger.calls.error[index][0]).to.equal(
          'Axios GET https://api.example.com → 400 Bad Request GET /x user=—',
        );
      }
    });
  });

  it('should fall back when Axios config or response is missing', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();
    const req = { method: 'GET', url: '/x' };

    middleware({ isAxiosError: true, code: 'ECONNREFUSED', message: 'refused' }, req, res, () => {});

    expect(logger.calls.error[0][0]).to.equal('Axios ? ? → ECONNREFUSED GET /x user=—');
    expect(res.statusCode).to.equal(500);
  });

  it('should log unexpected errors with message and stack', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();
    const req = { method: 'GET', route: { path: '/boom' }, user: { id: 'u9' } };
    const error = new Error('something broke');

    middleware(error, req, res, () => {});

    expect(logger.calls.error[0][0]).to.equal('Error: something broke GET /boom user=u9');
    expect(logger.calls.error[1][0]).to.equal(error.stack);
    expect(res.statusCode).to.equal(500);
    expect(res.body.error_code).to.equal('SERVER_ERROR');
  });

  it('should log unexpected errors without stack when missing', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();
    const req = { method: 'GET', url: '/x' };

    middleware({ name: 'WeirdError', message: 'no stack' }, req, res, () => {});

    expect(logger.calls.error).to.have.length(1);
    expect(logger.calls.error[0][0]).to.equal('WeirdError: no stack GET /x user=—');
    expect(res.statusCode).to.equal(500);
  });

  it('should truncate long Axios response payloads', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();
    const req = { method: 'POST', url: '/x' };
    const long = 'x'.repeat(500);

    middleware(
      {
        name: 'AxiosError',
        config: { method: 'post', url: 'https://api.example.com' },
        response: { status: 500, statusText: 'Error', data: long },
      },
      req,
      res,
      () => {},
    );

    const logged = logger.calls.error[0][0];
    expect(logged).to.include('x'.repeat(200));
    expect(logged).to.not.include('x'.repeat(201));
  });

  it('should ignore response data that cannot be stringified', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();
    const req = { method: 'GET', url: '/x' };
    const circular = {};
    circular.self = circular;

    middleware(
      {
        isAxiosError: true,
        config: { method: 'get', url: 'https://api.example.com' },
        response: { status: 500, statusText: 'Error', data: circular },
      },
      req,
      res,
      () => {},
    );

    expect(logger.calls.error[0][0]).to.equal('Axios GET https://api.example.com → 500 Error GET /x user=—');
  });

  it('should use placeholders when request method and path are missing', () => {
    const logger = createLoggerSpy();
    const middleware = getErrorMiddleware(logger);
    const res = createMockRes();

    middleware(new ForbiddenError(), {}, res, () => {});

    expect(logger.calls.warn[0][0]).to.equal('403 Forbidden ? ? user=—');
  });
});
