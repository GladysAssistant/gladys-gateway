// The users of an instance who linked Google Home are needed for every report state the
// instance sends (every state change of every device exposed to Google), so they are cached
// per instance. The cache is dropped as soon as a Google Home session is created or revoked;
// the expiry only covers the rare paths that do not drop it (account deleted by an admin...).
const GOOGLE_USERS_REDIS_PREFIX = 'google-users';
const GOOGLE_USERS_CACHE_EXPIRY_IN_SECONDS = 15 * 60;

function getGoogleUsersCacheKey(instanceId) {
  return `${GOOGLE_USERS_REDIS_PREFIX}:${instanceId}`;
}

/**
 * Drop the cached Google Home users of every instance of the account of a user. Never
 * throws: the session is created or revoked anyway, and the cache expires by itself.
 */
async function invalidateGoogleUsersCacheOfUser(logger, db, redisClient, userId) {
  try {
    const instances = await db.query(
      `
        SELECT t_instance.id
        FROM t_instance
        INNER JOIN t_user ON t_user.account_id = t_instance.account_id
        WHERE t_user.id = $1;
      `,
      [userId],
    );
    if (instances.length > 0) {
      await redisClient.del(instances.map((instance) => getGoogleUsersCacheKey(instance.id)));
    }
  } catch (e) {
    logger.warn(`Unable to invalidate the Google Home users cache of user ${userId}`);
    logger.warn(e);
  }
}

module.exports = {
  GOOGLE_USERS_CACHE_EXPIRY_IN_SECONDS,
  getGoogleUsersCacheKey,
  invalidateGoogleUsersCacheOfUser,
};
