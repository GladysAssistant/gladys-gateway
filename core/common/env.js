/**
 * A positive integer read from an environment variable, or the default value when the
 * variable is missing, not a number, zero or negative.
 */
function readPositiveIntegerEnv(name, defaultValue) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

module.exports = { readPositiveIntegerEnv };
