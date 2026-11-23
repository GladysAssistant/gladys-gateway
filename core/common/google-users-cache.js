const { callOptionalRedisCommand } = require('./redis');
const { invalidateCachedValues } = require('./cache');

// The users of an instance who linked Google Home are needed for every report state the
// instance sends (every state change of every device exposed to Google), so they are cached
// per instance. The cache is invalidated as soon as a Google Home session is created or
// revoked, or a user or an account is deleted; the expiry only covers the paths that do not.
const GOOGLE_USERS_REDIS_PREFIX = 'google-users';
const GOOGLE_USERS_CACHE_EXPIRY_IN_SECONDS = 15 * 60;

function getGoogleUsersCacheKey(instanceId) {
  return `${GOOGLE_USERS_REDIS_PREFIX}:${instanceId}`;
}

// Never throws, and never waits for Redis (callers have already written in database and are
// answering a request): the cache then expires by itself.
async function invalidateGoogleUsersCacheOfInstances(logger, db, redisClient, instancesQuery, id) {
  try {
    const instances = await db.query(instancesQuery, [id]);
    if (instances.length > 0) {
      const keys = instances.map((instance) => getGoogleUsersCacheKey(instance.id));
      await callOptionalRedisCommand(redisClient, () => invalidateCachedValues(redisClient, keys));
    }
  } catch (e) {
    logger.warn(`Unable to invalidate the Google Home users cache (${id}): ${e.message}`);
  }
}

/**
 * Invalidate the cached Google Home users of every instance of the account of a user.
 */
function invalidateGoogleUsersCacheOfUser(logger, db, redisClient, userId) {
  const instancesQuery = `
    SELECT t_instance.id
    FROM t_instance
    INNER JOIN t_user ON t_user.account_id = t_instance.account_id
    WHERE t_user.id = $1;
  `;
  return invalidateGoogleUsersCacheOfInstances(logger, db, redisClient, instancesQuery, userId);
}

/**
 * Invalidate the cached Google Home users of every instance of an account (for a user who is
 * no longer in database, or an account being deleted).
 */
function invalidateGoogleUsersCacheOfAccount(logger, db, redisClient, accountId) {
  const instancesQuery = 'SELECT id FROM t_instance WHERE account_id = $1;';
  return invalidateGoogleUsersCacheOfInstances(logger, db, redisClient, instancesQuery, accountId);
}

module.exports = {
  GOOGLE_USERS_CACHE_EXPIRY_IN_SECONDS,
  getGoogleUsersCacheKey,
  invalidateGoogleUsersCacheOfUser,
  invalidateGoogleUsersCacheOfAccount,
};
