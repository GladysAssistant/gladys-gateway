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

module.exports = function getErrorMiddleware(logger) {
  return function ErrorMiddleware(error, req, res, next) {
    // Don't log 401 errors
    if (!(error instanceof UnauthorizedError)) {
      logger.error('ERROR_MIDDLEWARE');
      logger.error(error);
      logger.error({ path: req.route && req.route.path, user: req.user && req.user.id });
    }

    if (
      error instanceof ValidationError ||
      error instanceof AlreadyExistError ||
      error instanceof NotFoundError ||
      error instanceof ForbiddenError ||
      error instanceof UnauthorizedError ||
      error instanceof BadRequestError ||
      error instanceof TooManyRequestsError ||
      error instanceof PaymentRequiredError
    ) {
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
};
