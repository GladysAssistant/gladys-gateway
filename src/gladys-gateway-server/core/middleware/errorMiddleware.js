const { ValidationError, AlreadyExistError, NotFoundError } = require('../common/error');

module.exports = function(error, req, res, next) {
  console.log(error);
  if (error instanceof ValidationError || error instanceof AlreadyExistError || error instanceof NotFoundError) {
    //console.log(error);
    return res.status(error.getStatus()).json(error.jsonError());
  } else {
    next(error);
  }
};