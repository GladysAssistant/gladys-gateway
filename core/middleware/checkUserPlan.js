const { ForbiddenError, PaymentRequiredError } = require('../common/error');
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

      // A subscription that does not include the feature (a Lite account calling a
      // Plus route) is not a payment problem: 403, never 402. Gladys locks its Plus
      // features and warns the admins on every 402, and only a success on GET /backups
      // (a Plus route, checked here daily) lifts that lock: a 402 answered to a Lite
      // account would lock it for good. The plan is checked before the status on
      // purpose: a Lite account never gets a 402 here, whether it is paid or not, so
      // this 403 says nothing about its payment.
      if (account.plan !== plan) {
        throw new ForbiddenError(`Account is in plan ${account.plan} and should be in plan ${plan}`);
      }

      if (ALLOWED_ACCOUNT_STATUS.indexOf(account.status) === -1) {
        throw new PaymentRequiredError(`Account is not active`);
      }

      next();
    });
  };
};
