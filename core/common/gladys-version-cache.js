const { callOptionalRedisCommand } = require('./redis');
const { invalidateCachedValues } = require('./cache');

// The current Gladys version is asked by every Gladys instance (GET /v1/api/gladys/version),
// it is cached. The admin API invalidates the cache when it creates or updates a version; the
// expiry covers a version changed in database by hand.
const CURRENT_GLADYS_VERSION_CACHE_KEY = 'gladys-version:current';
const CURRENT_GLADYS_VERSION_CACHE_EXPIRY_IN_SECONDS = 5 * 60;

/**
 * Invalidate the cached current version. Never throws: the version is created or updated
 * anyway, Gladys instances then see it when the cache expires.
 */
async function invalidateCurrentGladysVersionCache(logger, redisClient) {
  try {
    await callOptionalRedisCommand(redisClient, () =>
      invalidateCachedValues(redisClient, [CURRENT_GLADYS_VERSION_CACHE_KEY]),
    );
  } catch (e) {
    logger.warn(`Unable to invalidate the current Gladys version cache (${e.message})`);
  }
}

module.exports = {
  CURRENT_GLADYS_VERSION_CACHE_KEY,
  CURRENT_GLADYS_VERSION_CACHE_EXPIRY_IN_SECONDS,
  invalidateCurrentGladysVersionCache,
};
