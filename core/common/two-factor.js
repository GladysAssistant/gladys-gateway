const speakeasy = require('speakeasy');
const { ForbiddenError, TooManyRequestsError } = require('./error');

// A TOTP code has 6 digits and is accepted with a window of 2 steps: without a limit on
// failed attempts per user, an attacker knowing the password can brute force the code.
const TWO_FACTOR_MAX_FAILED_ATTEMPTS = 5;
const TWO_FACTOR_FAILED_ATTEMPTS_WINDOW_IN_SECONDS = 15 * 60;
const TWO_FACTOR_FAILED_ATTEMPTS_REDIS_PREFIX = 'two_factor_failed_attempts';

// Verification of a user's TOTP code, with the per-user failed attempts limit: shared by
// the login and the sensitive operations of the user, and by the account operations an
// admin confirms with their own second factor.
module.exports = function TwoFactorVerifier(logger, redisClient) {
  function getTwoFactorAttemptsKey(userId) {
    return `${TWO_FACTOR_FAILED_ATTEMPTS_REDIS_PREFIX}:${userId}`;
  }

  // Counts the attempt BEFORE verifying the code, atomically (SET NX EX + INCR in one
  // MULTI), so concurrent requests cannot all slip under the limit, and the key always
  // carries a TTL even if the process dies between the two commands.
  async function countTwoFactorAttempt(userId) {
    const key = getTwoFactorAttemptsKey(userId);
    const [, attempts] = await redisClient
      .multi()
      .set(key, 0, { NX: true, EX: TWO_FACTOR_FAILED_ATTEMPTS_WINDOW_IN_SECONDS })
      .incr(key)
      .exec();
    return attempts;
  }

  async function resetFailedTwoFactorAttempts(userId) {
    await redisClient.del(getTwoFactorAttemptsKey(userId));
  }

  // Verifies a TOTP code with the per-user failed attempts limit applied
  async function verifyTwoFactorCode(userId, twoFactorSecret, twoFactorCode) {
    const attempts = await countTwoFactorAttempt(userId);
    if (attempts > TWO_FACTOR_MAX_FAILED_ATTEMPTS) {
      logger.warn(`Two factor: too many failed attempts for user ${userId}`);
      throw new TooManyRequestsError('Too many failed two factor attempts, try again later.');
    }

    const isCodeAStringOrANumber = typeof twoFactorCode === 'string' || typeof twoFactorCode === 'number';
    const tokenValidates = speakeasy.totp.verify({
      secret: twoFactorSecret,
      token: isCodeAStringOrANumber ? String(twoFactorCode) : '',
      window: 2,
    });

    if (!tokenValidates) {
      throw new ForbiddenError();
    }

    await resetFailedTwoFactorAttempts(userId);
  }

  // Sensitive operations on a logged-in account (changing the email address, replacing the
  // TOTP secret, regenerating the recovery codes, resetting the second factor of another
  // user of the account) require the CURRENT second factor, not only an access token.
  // Otherwise a stolen 1-hour access token would be enough to redirect the account recovery
  // flow (email + 2FA) to an attacker and take over the account for good.
  // A user without two factor enabled has nothing to prove.
  async function verifyCurrentTwoFactor(userWithSecret, twoFactorCode, actionDescription) {
    if (userWithSecret.two_factor_enabled !== true) {
      return;
    }

    if (twoFactorCode === undefined || twoFactorCode === null) {
      throw new ForbiddenError(`A valid two factor code is required to ${actionDescription}`);
    }

    await verifyTwoFactorCode(userWithSecret.id, userWithSecret.two_factor_secret, twoFactorCode);
  }

  return {
    verifyTwoFactorCode,
    verifyCurrentTwoFactor,
  };
};
