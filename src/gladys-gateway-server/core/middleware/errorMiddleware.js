const { ValidationError, AlreadyExistError, NotFoundError, ForbiddenError, UnauthorizedError } = require('../common/error');

module.exports = function(error, req, res, next) {
  if (error instanceof ValidationError || error instanceof AlreadyExistError || error instanceof NotFoundError || error instanceof ForbiddenError || error instanceof UnauthorizedError) {
    //console.log(error);
    return res.status(error.getStatus()).json(error.jsonError());
  } else {
    next(error);
  }
};