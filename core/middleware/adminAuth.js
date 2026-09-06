const { RateLimiterRedis } = require('rate-limiter-flexible');

const { UnauthorizedError, TooManyRequestsError } = require('../common/error');
const { secureCompare } = require('../common/secure-compare');
const asyncMiddleware = require('./asyncMiddleware');

const API_KEY_HEADER = 'x-admin-api-key';
const MIN_API_KEY_LENGTH = 64;
const MAX_FAILS = 5;

/**
 * Authentication of the admin API (/admin/api/*).
 *
 * Two ways to authenticate:
 *  - Machine access (scripts, CI, AI agents): header "X-Admin-Api-Key" holding one of the
 *    API keys allowed on the route (by default ADMIN_API_AUTHORIZATION_TOKEN only). Keys are
 *    compared in constant time and wrong keys are rate limited per IP (5 fails per 24 hours).
 *  - Human access (admin UI): a regular Gladys Plus access token ("Authorization: Bearer <jwt>"
 *    with the dashboard:write scope) belonging to the super admin user (SUPER_ADMIN_USER_ID).
 *
 * On success, req.admin describes who is calling so mutations can be audited.
 */
module.exports = function AdminAuth(logger, redisClient, accessTokenAuth) {
  const limiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rate_limit:admin_auth',
    points: MAX_FAILS, // fails per 24 hours
    duration: 24 * 60 * 60, // 24 hour
  });

  const dashboardWriteAuth = accessTokenAuth({ scope: 'dashboard:write' });

  function getApiKey(envName) {
    const apiKey = process.env[envName];
    if (!apiKey) {
      return null;
    }
    if (apiKey.length < MIN_API_KEY_LENGTH) {
      throw new Error(`${envName} should be with a length of at least ${MIN_API_KEY_LENGTH}`);
    }
    return apiKey;
  }

  // Fail at startup, not at the first request, when a configured key is too weak
  getApiKey('ADMIN_API_AUTHORIZATION_TOKEN');
  getApiKey('GLADYS_VERSION_API_KEY');

  async function consumeFailedAttempt(ip) {
    try {
      await limiter.consume(ip);
    } catch (e) {
      logger.warn(`AdminAuth: Client ${ip} has been querying too much this route`);
      throw new TooManyRequestsError('Too many requests.');
    }
  }

  async function authenticateWithApiKey(req, allowedKeys) {
    const limiterResult = await limiter.get(req.ip);
    if (limiterResult && limiterResult.consumedPoints > MAX_FAILS) {
      logger.warn(`AdminAuth: Client ${req.ip} has been querying too much this route`);
      throw new TooManyRequestsError('Too many requests.');
    }

    const providedKey = req.headers[API_KEY_HEADER];
    // Every allowed key is compared, even after a match, so the response time
    // does not depend on which key matched.
    let matchedKeyName = null;
    allowedKeys.forEach((envName) => {
      const expectedKey = getApiKey(envName);
      if (expectedKey !== null && secureCompare(providedKey, expectedKey)) {
        matchedKeyName = envName;
      }
    });

    if (matchedKeyName === null) {
      await consumeFailedAttempt(req.ip);
      throw new UnauthorizedError();
    }

    req.admin = { auth_mode: 'api_key', api_key_name: matchedKeyName };
  }

  function authenticateWithSuperAdminToken(req, res) {
    return new Promise((resolve, reject) => {
      const next = (error) => (error ? reject(error) : resolve());
      Promise.resolve()
        .then(() => dashboardWriteAuth(req, res, next))
        .catch(reject);
    }).then(() => {
      const superAdminUserId = process.env.SUPER_ADMIN_USER_ID;
      if (!superAdminUserId || !req.user || req.user.id !== superAdminUserId) {
        throw new UnauthorizedError();
      }
      req.admin = { auth_mode: 'super_admin', user_id: req.user.id };
    });
  }

  /**
   * @param {Object} options
   * @param {Array<string>} options.apiKeys Names of the env variables holding the API keys
   *  accepted on this route. Default: ['ADMIN_API_AUTHORIZATION_TOKEN'].
   */
  return function adminAuth(options = {}) {
    const allowedKeys = options.apiKeys || ['ADMIN_API_AUTHORIZATION_TOKEN'];
    return asyncMiddleware(async (req, res, next) => {
      if (req.headers[API_KEY_HEADER] !== undefined) {
        await authenticateWithApiKey(req, allowedKeys);
      } else if (req.headers.authorization !== undefined) {
        await authenticateWithSuperAdminToken(req, res);
      } else {
        throw new UnauthorizedError();
      }
      logger.info(`AdminAuth: admin request authenticated (${req.admin.auth_mode})`);
      return next();
    });
  };
};
