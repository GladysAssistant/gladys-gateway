const { PaymentRequiredError } = require('../common/error');
const asyncMiddleware = require('./asyncMiddleware');

const ALLOWED_ACCOUNT_STATUS = ['active', 'trialing'];

module.exports = function checkUserPlan(userModel, instanceModel, logger) {
  return function checkUserPlanByPlan(plan) {
    return asyncMiddleware(async (req, res, next) => {
      let account;
      // This middleware serves user
      if (req.user) {
        logger.debug(`checkUserPlan: Verify that user ${req.user.id} has access to plan ${plan} and is active.`);
        account = await userModel.getMySelf(req.user);
      }
      // and instances!
      if (req.instance) {
        logger.debug(
          `checkUserPlan: Verify that instance ${req.instance.id} has access to plan ${plan} and is active.`,
        );
        account = await instanceModel.getAccountByInstanceId(req.instance.id);
      }

      if (account.plan !== plan) {
        throw new PaymentRequiredError(`Account is in plan ${account.plan} and should be in plan ${plan}`);
      }

      if (ALLOWED_ACCOUNT_STATUS.indexOf(account.status) === -1) {
        throw new PaymentRequiredError(`Account is not active`);
      }

      next();
    });
  };
};
