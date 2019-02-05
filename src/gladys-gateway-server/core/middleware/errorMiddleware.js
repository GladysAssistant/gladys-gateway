const {
  ValidationError, AlreadyExistError, NotFoundError, ForbiddenError,
  UnauthorizedError, ServerError, PaymentRequiredError,
} = require('../common/error');

module.exports = function ErrorMiddleware(error, req, res, next) {
  if (error instanceof ValidationError || error instanceof AlreadyExistError
    || error instanceof NotFoundError || error instanceof ForbiddenError || error instanceof UnauthorizedError) {
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
