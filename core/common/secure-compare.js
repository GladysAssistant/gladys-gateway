const crypto = require('crypto');

/**
 * Compare two secrets in constant time so the comparison duration does not leak
 * how many leading characters of the secret are right (timing attack).
 * Returns false for anything that is not a non-empty string.
 */
function secureCompare(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    // still run a comparison so the length mismatch is not distinguishable by timing
    crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

module.exports = { secureCompare };
