const Promise = require('bluebird');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const { ForbiddenError } = require('../../common/error');

const GOOGLE_OAUTH_CODE_REDIS_PREFIX = `GOOGLE_OAUTH_CODE`;
const GOOGLE_CODE_EXPIRY_IN_SECONDS = 60 * 60;
const JWT_AUDIENCE = 'google-home-oauth';
const SCOPE = ['google-home'];

const { GOOGLE_HOME_OAUTH_CLIENT_ID } = process.env;

module.exports = function AdminModel(logger, db, redisClient, jwtService) {
  async function getRefreshTokenAndAccessToken(code) {
    const userId = await redisClient.getAsync(`${GOOGLE_OAUTH_CODE_REDIS_PREFIX}:${code}`);
    if (userId === null) {
      throw new ForbiddenError('INVALID_CODE');
    }
    const user = await db.t_user.findOne(
      {
        id: userId,
      },
      {
        fields: ['id', 'gladys_4_user_id'],
      },
    );
    const newDevice = {
      id: uuid.v4(),
      name: 'Google Home',
      client_id: GOOGLE_HOME_OAUTH_CLIENT_ID,
      user_id: user.id,
    };

    const refreshToken = jwtService.generateRefreshTokenOauth(user, SCOPE, newDevice.id, JWT_AUDIENCE);
    const accessToken = jwtService.generateAccessTokenOauth(user, SCOPE, JWT_AUDIENCE);
    newDevice.refresh_token_hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await db.t_device.insert(newDevice);
    return {
      accessToken,
      refreshToken,
    };
  }

  async function getAccessToken(refreshToken) {
    let userId;
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_TOKEN_SECRET, {
        audience: JWT_AUDIENCE,
        issuer: 'gladys-gateway',
      });
      userId = decoded.user_id;
    } catch (e) {
      logger.debug(e);
      throw new ForbiddenError();
    }

    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // we are looking for devices not revoked with
    // this refresh_token_hash
    const device = await db.t_device.findOne({
      user_id: userId,
      refresh_token_hash: refreshTokenHash,
      revoked: false,
      is_deleted: false,
    });

    // the device doesn't exist or has been revoked
    if (device === null) {
      logger.debug(`Forbidden: Refresh token not found in DB`);
      throw new ForbiddenError();
    }

    // we get the current user account, to be sure the account is active
    const fullUser = await db.t_user.findOne({
      id: userId,
      is_deleted: false,
    });

    // the user doesn't exist or has been revoked
    if (fullUser === null) {
      logger.debug(`Forbidden: User not found or revoked`);
      throw new ForbiddenError();
    }

    const accessToken = jwtService.generateAccessTokenOauth(fullUser, SCOPE, JWT_AUDIENCE);

    return {
      accessToken,
    };
  }

  async function getCode(userId) {
    // we generate a random code
    const code = (await randomBytes(64)).toString('hex');
    // we save the code in Redis
    await redisClient.setAsync(
      `${GOOGLE_OAUTH_CODE_REDIS_PREFIX}:${code}`,
      userId,
      'EX',
      GOOGLE_CODE_EXPIRY_IN_SECONDS,
    );
    return code;
  }

  return {
    getRefreshTokenAndAccessToken,
    getAccessToken,
    getCode,
  };
};
