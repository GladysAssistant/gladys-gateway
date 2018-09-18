class NotFoundError extends Error {
  constructor(errorMessage) {
    super(errorMessage);
    this.errorMessage = errorMessage;
    // the next line is important so that the ValidationError constructor is not part
    // of the resulting stacktrace
    Error.captureStackTrace(this, ValidationError);
  }

  // we can also define custom methods on this class
  jsonError() {
    return {
      status: 404,
      error_code: 'NOT_FOUND',
      error_message: this.errorMessage
    };
  }

  getStatus(){
    return 404;
  }
}

class ValidationError extends Error {
  constructor(objectName, joiError) {
    var errorMessage = `ValidationError: ${objectName} object.`;
    super(errorMessage);
    this.objectName = objectName;
    this.joiError = joiError;
    // the next line is important so that the ValidationError constructor is not part
    // of the resulting stacktrace
    Error.captureStackTrace(this, ValidationError);
  }

  // we can also define custom methods on this class
  jsonError() {
    return {
      status: 422,
      error_code: 'UNPROCESSABLE_ENTITY',
      details: this.joiError.details
    };
  }

  getStatus(){
    return 422;
  }
}

class AlreadyExistError extends Error {
  constructor(objectName, identifier) {
    var errorMessage = `${objectName} "${identifier}" already exist.`;
    super(errorMessage);
    this.objectName = objectName;
    this.identifier = identifier;
    this.errorMessage = errorMessage;
    // the next line is important so that the ValidationError constructor is not part
    // of the resulting stacktrace
    Error.captureStackTrace(this, ValidationError);
  }

  // we can also define custom methods on this class
  jsonError() {
    return {
      status: 409,
      error_code: 'ALREADY_EXIST',
      error_message: this.errorMessage
    };
  }

  getStatus(){
    return 409;
  }
}

module.exports.ValidationError = ValidationError;
module.exports.AlreadyExistError = AlreadyExistError;
module.exports.NotFoundError = NotFoundError;