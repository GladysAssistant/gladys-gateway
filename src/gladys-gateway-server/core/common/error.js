class NotFoundError extends Error {
  constructor(errorMessage) {
    super(errorMessage);
    this.errorMessage = errorMessage;
    this.code = 404;

    // the next line is important so that the ValidationError constructor is not part
    // of the resulting stacktrace
    Error.captureStackTrace(this, NotFoundError);
  }

  // we can also define custom methods on this class
  jsonError() {
    return {
      status: this.code,
      error_code: 'NOT_FOUND',
      error_message: this.errorMessage,
    };
  }

  getStatus() {
    return this.code;
  }
}

class BadRequestError extends Error {
  constructor(errorMessage) {
    super(errorMessage);
    this.errorMessage = errorMessage;
    this.code = 400;

    // the next line is important so that the ValidationError constructor is not part
    // of the resulting stacktrace
    Error.captureStackTrace(this, NotFoundError);
  }

  // we can also define custom methods on this class
  jsonError() {
    return {
      status: this.code,
      error_code: 'BAD_REQUEST',
      error_message: this.errorMessage,
    };
  }

  getStatus() {
    return this.code;
  }
}

class ValidationError extends Error {
  constructor(objectName, joiError) {
    const errorMessage = `ValidationError: ${objectName} object.`;
    super(errorMessage);
    this.objectName = objectName;
    this.joiError = joiError;
    this.code = 422;
    // the next line is important so that the ValidationError constructor is not part
    // of the resulting stacktrace
    Error.captureStackTrace(this, ValidationError);
  }

  // we can also define custom methods on this class
  jsonError() {
    return {
      status: this.code,
      error_code: 'UNPROCESSABLE_ENTITY',
      details: this.joiError && this.joiError.details,
    };
  }

  getStatus() {
    return this.code;
  }
}

class AlreadyExistError extends Error {
  constructor(objectName, identifier) {
    const errorMessage = `${objectName} "${identifier}" already exist.`;
    super(errorMessage);
    this.objectName = objectName;
    this.identifier = identifier;
    this.errorMessage = errorMessage;
    this.code = 409;

    // the next line is important so that the ValidationError constructor is not part
    // of the resulting stacktrace
    Error.captureStackTrace(this, AlreadyExistError);
  }

  // we can also define custom methods on this class
  jsonError() {
    return {
      status: this.code,
      error_code: 'ALREADY_EXIST',
      error_message: this.errorMessage,
    };
  }

  getStatus() {
    return this.code;
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message || 'Forbidden');
    this.message = message || 'Forbidden';
    this.code = 403;

    // the next line is important so that the ValidationError constructor is not part
    // of the resulting stacktrace
    Error.captureStackTrace(this, ForbiddenError);
  }

  // we can also define custom methods on this class
  jsonError() {
    const error = {
      status: this.code,
      error_code: 'FORBIDDEN',
    };

    if (this.message) {
      error.error_message = this.message;
    }

    return error;
  }

  getStatus() {
    return this.code;
  }
}

class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.code = 401;

    // the next line is important so that the ValidationError constructor is not part
    // of the resulting stacktrace
    Error.captureStackTrace(this, UnauthorizedError);
  }

  // we can also define custom methods on this class
  jsonError() {
    return {
      status: this.code,
      error_code: 'UNAUTHORIZED',
    };
  }

  getStatus() {
    return this.code;
  }
}

class ServerError extends Error {
  constructor() {
    super('SERVER_ERROR');
    this.code = 500;

    // the next line is important so that the ValidationError constructor is not part
    // of the resulting stacktrace
    Error.captureStackTrace(this, ServerError);
  }

  // we can also define custom methods on this class
  jsonError() {
    return {
      status: this.code,
      error_code: 'SERVER_ERROR',
    };
  }

  getStatus() {
    return this.code;
  }
}

class PaymentRequiredError extends Error {
  constructor(message) {
    super(message);

    this.message = message;
    this.code = 402;

    // the next line is important so that the ValidationError constructor is not part
    // of the resulting stacktrace
    Error.captureStackTrace(this, PaymentRequiredError);
  }

  // we can also define custom methods on this class
  jsonError() {
    return {
      status: this.code,
      error_code: 'PAYMENT_REQUIRED',
      error_message: this.message,
    };
  }

  getStatus() {
    return this.code;
  }
}

module.exports.ValidationError = ValidationError;
module.exports.BadRequestError = BadRequestError;
module.exports.AlreadyExistError = AlreadyExistError;
module.exports.NotFoundError = NotFoundError;
module.exports.ForbiddenError = ForbiddenError;
module.exports.UnauthorizedError = UnauthorizedError;
module.exports.ServerError = ServerError;
module.exports.PaymentRequiredError = PaymentRequiredError;
