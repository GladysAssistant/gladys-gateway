const { ValidationError, AlreadyExistError } = require('../common/error');

module.exports = function(error, req, res, next) {
  if (error instanceof ValidationError || error instanceof AlreadyExistError) {
    //console.log(error);
    return res.status(error.getStatus()).json(error.jsonError());
  } else {
    next(error);
  }
};