// Values cached in Redis and invalidated when the database changes (Google Home users of an
// instance, current Gladys version, Tempo history). A request that read the database just
// before a change could otherwise write its stale value in cache right after the
// invalidation, where it would live for the whole expiry. So the invalidation does not
// delete the key: it leaves a marker for a few seconds, and a value is only written where
// there is no key (SET NX). A value read before the change finds the marker and is not
// cached; while the marker lives, the requests read the database.
const INVALIDATED_MARKER = 'invalidated';
const INVALIDATED_MARKER_EXPIRY_IN_SECONDS = 30;

/**
 * The cached value, or null when there is none (missing, expired or invalidated).
 */
async function getCachedValue(redisClient, key) {
  const value = await redisClient.get(key);
  if (value === null || value === INVALIDATED_MARKER) {
    return null;
  }
  return JSON.parse(value);
}

/**
 * Cache a value read in database, unless the key was invalidated in the meantime.
 */
async function setCachedValue(redisClient, key, value, expiryInSeconds) {
  await redisClient.set(key, JSON.stringify(value), { NX: true, EX: expiryInSeconds });
}

/**
 * Invalidate cached values, after the change in database.
 */
async function invalidateCachedValues(redisClient, keys) {
  const transaction = redisClient.multi();
  keys.forEach((key) => transaction.set(key, INVALIDATED_MARKER, { EX: INVALIDATED_MARKER_EXPIRY_IN_SECONDS }));
  await transaction.exec();
}

module.exports = {
  INVALIDATED_MARKER,
  INVALIDATED_MARKER_EXPIRY_IN_SECONDS,
  getCachedValue,
  setCachedValue,
  invalidateCachedValues,
};
