const { ForbiddenError, PaymentRequiredError } = require('../common/error');
const asyncMiddleware = require('./asyncMiddleware');
const { callOptionalRedisCommand } = require('../common/redis');

const ALLOWED_ACCOUNT_STATUS = ['active', 'trialing'];

// A granted access is cached for a few minutes: these routes come in bursts (TTS, STT,
// OpenAI...) and the answer only changes with the subscription. Only a granted access is
// cached, never a refusal: an account that just subscribed or upgraded gets in right away,
// a canceled or unpaid one keeps its access for this long at most.
const GRANTED_ACCESS_CACHE_TTL_IN_SECONDS = 5 * 60;
const GRANTED_ACCESS_CACHE_PREFIX = 'check_user_plan_granted';

// The cached access, or null when it is not cached, or Redis is not ready, failed or did not
// answer in time: the access is then checked in database
async function readGrantedAccessCache(redisClient, cacheKey, logger) {
  try {
    return await callOptionalRedisCommand(redisClient, () => redisClient.get(cacheKey));
  } catch (e) {
    logger.warn(`checkUserPlan: unable to read the access cache (${e.message})`);
    return null;
  }
}

function getGrantedAccessCacheKey(req, plan) {
  // the instance wins over the user, as below
  if (req.instance) {
    return `${GRANTED_ACCESS_CACHE_PREFIX}:${plan}:instance:${req.instance.id}`;
  }
  return `${GRANTED_ACCESS_CACHE_PREFIX}:${plan}:user:${req.user.id}`;
}

module.exports = function checkUserPlan(userModel, instanceModel, redisClient, logger) {
  return function checkUserPlanByPlan(plan) {
    return asyncMiddleware(async (req, res, next) => {
      const cacheKey = getGrantedAccessCacheKey(req, plan);
      // the cache is only a shortcut: when Redis fails, the access is checked in database
      if (await readGrantedAccessCache(redisClient, cacheKey, logger)) {
        next();
        return;
      }

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

      // not awaited: the request does not wait for Redis to cache the access
      callOptionalRedisCommand(redisClient, () =>
        redisClient.set(cacheKey, '1', { EX: GRANTED_ACCESS_CACHE_TTL_IN_SECONDS }),
      ).catch((e) => {
        logger.warn(`checkUserPlan: unable to cache the access (${e.message})`);
      });

      next();
    });
  };
};
