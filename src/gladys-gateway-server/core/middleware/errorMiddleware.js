const { ValidationError, AlreadyExistError, NotFoundError, ForbiddenError, UnauthorizedError, ServerError, PaymentRequiredError } = require('../common/error');

module.exports = function(error, req, res, next) {
  if (error instanceof ValidationError || error instanceof AlreadyExistError || error instanceof NotFoundError || error instanceof ForbiddenError || error instanceof UnauthorizedError) {
    //console.log(error);
    return res.status(error.getStatus()).json(error.jsonError());
  } 
  
  // handle stripe error
  else if(error && error.type === 'StripeCardError' && error.statusCode) {
    var error = new PaymentRequiredError(error.message);
    return res.status(error.getStatus()).json(error.jsonError());
  } 
  
  else {
    console.log(error);
    var serverError = new ServerError();
    return res.status(serverError.getStatus()).json(error.json());
  }
};