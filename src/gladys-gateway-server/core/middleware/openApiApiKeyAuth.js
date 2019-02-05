const { UnauthorizedError } = require('../common/error');

module.exports = function OpenApiKeyAuthMiddleware(openApiModel, userModel, instanceModel, statsService) {
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
    const primaryInstance = await instanceModel.getPrimaryInstanceByAccount(user.account_id);

    req.primaryInstance = primaryInstance;

    // update last used in DB
    await openApiModel.updateLastUsed(apiKey.id);

    // save event in stats
    statsService.track('openApiAccess', {
      user_id: user.id,
      route: req.route,
    });

    next();
  };
};
