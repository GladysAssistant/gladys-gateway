const { ForbiddenError } = require('../common/error');

const STREAMING_ACCESS_KEY_PREFIX = 'streaming-access-key';

module.exports = function cameraStreamAccessKeyAuth(redisClient, logger) {
  return async function CameraStreamAccessKeyAuth(req, res, next) {
    logger.debug(`CameraStreamAccessKeyAuth: ${req.params.stream_access_key}`);
    const userId = await redisClient.get(`${STREAMING_ACCESS_KEY_PREFIX}:${req.params.stream_access_key}`);

    if (!userId) {
      throw new ForbiddenError('Unknown streaming access key');
    }

    req.user = {
      id: userId,
    };

    next();
  };
};
