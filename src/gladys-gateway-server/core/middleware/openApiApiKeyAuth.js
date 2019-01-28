const { UnauthorizedError } = require('../common/error');

module.exports = function (openApiModel, userModel) {
  return async function(req, res, next) {
    
    // find open api key in DB
    const apiKey = await openApiModel.findOpenApiKey(req.params['open_api_key']);

    if(apiKey === null ) {
      throw new UnauthorizedError();
    }

    // get current user
    const user = await userModel.getMySelf({ id: apiKey.user_id });
    req.user = user;

    // update last used in DB
    await openApiModel.updateLastUsed(apiKey.id);

    next();
  };
};