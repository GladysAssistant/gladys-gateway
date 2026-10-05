// How long an optional Redis call (a cache, a routing hint) may hold a request
const OPTIONAL_REDIS_CALL_TIMEOUT_IN_MS = 200;

/**
 * Runs a Redis command the caller can do without, failing instead of waiting on Redis:
 * at once while the client reconnects (node-redis would queue the command until Redis is
 * back), and after a short timeout when Redis is slow. A failure rejects like a Redis error,
 * the caller handles both the same way.
 */
async function callOptionalRedisCommand(redisClient, command, timeoutInMs = OPTIONAL_REDIS_CALL_TIMEOUT_IN_MS) {
  if (!redisClient.isReady) {
    throw new Error('Redis is not ready');
  }
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis did not answer within ${timeoutInMs} ms`)), timeoutInMs);
  });
  try {
    // Promise.race handles a late rejection of the command: it never reaches the process
    return await Promise.race([command(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { callOptionalRedisCommand, OPTIONAL_REDIS_CALL_TIMEOUT_IN_MS };
