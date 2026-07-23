const { UnauthorizedError, NotFoundError } = require('../common/error');

module.exports = function OpenApiKeyAuthMiddleware(openApiModel, userModel, instanceModel, options = {}) {
  return async function OpenApiKeyAuth(req, res, next) {
    // find open api key in DB
    const apiKey = await openApiModel.findOpenApiKey(req.params.open_api_key);

    if (apiKey === null) {
      throw new UnauthorizedError();
    }

    // get current user
    const user = await userModel.getMySelf({ id: apiKey.user_id });
    req.user = user;

    // get instance id
    try {
      req.primaryInstance = await instanceModel.getPrimaryInstanceByAccount(user.account_id);
    } catch (e) {
      // some routes (external integration webhooks) must never fail when the
      // instance is missing, so they get a null primaryInstance instead of a 404
      if (options.instanceRequired === false && e instanceof NotFoundError) {
        req.primaryInstance = null;
      } else {
        throw e;
      }
    }

    // update last used in DB
    await openApiModel.updateLastUsed(apiKey.id);

    next();
  };
};
