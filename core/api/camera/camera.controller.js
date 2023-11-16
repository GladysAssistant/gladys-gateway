const { S3, ListObjectsCommand, GetObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { PassThrough } = require('stream');
const axios = require('axios');
const Promise = require('bluebird');
const randomBytes = Promise.promisify(require('crypto').randomBytes);
const { RateLimiterRedis } = require('rate-limiter-flexible');

const asyncMiddleware = require('../../middleware/asyncMiddleware');
const { NotFoundError, BadRequestError, TooManyRequestsError } = require('../../common/error');

const STREAMING_ACCESS_KEY_PREFIX = 'streaming-access-key';

module.exports = function CameraController(
  logger,
  userModel,
  instanceModel,
  legacyRedisClient,
  redisClient,
  telegramService,
) {
  const s3Client = new S3({
    forcePathStyle: false, // Configures to use subdomain/virtual calling format.
    endpoint: `https://${process.env.STORAGE_ENDPOINT}`,
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const trafficLimiter = new RateLimiterRedis({
    storeClient: legacyRedisClient,
    keyPrefix: 'rate_limit:camera_data_traffic',
    points: 50 * 1024 * 1024 * 1024, // Max bytes per month of camera traffic allowed
    duration: 30 * 24 * 60 * 60, // 30 days
  });

  const SESSION_ID_REGEX = /^camera-[a-zA-Z0-9-_]+$/;

  // Session_id usually looks like "camera-7835d25d-b8ce-4824-a235-23637f778f83-39-50-13"
  const validateSessionId = (sessionId) => {
    if (!SESSION_ID_REGEX.test(sessionId)) {
      throw new BadRequestError('Invalid session id');
    }
  };

  const AUTHORIZED_FILENAMES = ['index.m3u8', 'index.m3u8.key', 'key_info_file.txt'];
  const HLS_CHUNK_REGEX = /^index[0-9]+.ts$/;

  const validateFilename = (filename) => {
    if (AUTHORIZED_FILENAMES.includes(filename)) {
      return;
    }

    if (!HLS_CHUNK_REGEX.test(filename)) {
      throw new BadRequestError('Invalid filename');
    }
  };

  /**
   * @api {post} /cameras/:session_id/:filename Write camera file
   * @apiName post
   * @apiGroup Camera
   */
  async function writeCameraFile(req, res, next) {
    validateSessionId(req.params.session_id);
    validateFilename(req.params.filename);

    const limiterResult = await trafficLimiter.get(req.instance.id);
    if (limiterResult && limiterResult.remainingPoints <= 0) {
      logger.warn(`Camera: Client ${req.instance.id} has used too much camera traffic.`);
      throw new TooManyRequestsError('Too much camera traffic used this month');
    }

    const passThrough = new PassThrough();

    const key = `${req.instance.id}/${req.params.session_id}/${req.params.filename}`;

    const params = {
      Bucket: process.env.CAMERA_STORAGE_BUCKET,
      Key: key,
      Body: passThrough,
      ContentType: 'application/octet-stream',
    };

    const upload = new Upload({
      client: s3Client,
      params,
    });

    let streamLength = 0;
    passThrough.on('data', (chunk) => {
      streamLength += chunk.length;
    });

    req.pipe(passThrough);

    await upload.done();

    try {
      await trafficLimiter.consume(req.instance.id, streamLength);
    } catch (e) {
      logger.warn(`Too many requests used this month, will fail at next call`);
    }

    res.json({ success: true });
  }

  /**
   * @api {post} /cameras/streaming/start Start streaming
   * @apiName startStreaming
   * @apiGroup Camera
   */
  async function startStreaming(req, res, next) {
    const streamAccessKey = (await randomBytes(36)).toString('hex');
    await redisClient.set(`${STREAMING_ACCESS_KEY_PREFIX}:${streamAccessKey}`, req.user.id, {
      EX: 60 * 60, // 1 hour in second
    });
    res.json({
      stream_access_key: streamAccessKey,
    });
  }

  /**
   * @api {get} /cameras/:session_id/:filename Read camera file
   * @apiName get
   * @apiGroup Camera
   */
  async function getCameraFile(req, res, next) {
    validateSessionId(req.params.session_id);
    validateFilename(req.params.filename);
    // Special case for key file, as we don't get them on the Gateway side
    // We override it
    if (req.params.filename === 'index.m3u8.key') {
      res.setHeader('content-type', 'application/octet-stream');
      res.send('not-a-key');
      return;
    }
    const primaryInstanceId = await instanceModel.getPrimaryInstanceIdByUserId(req.user.id);
    const key = `${primaryInstanceId}/${req.params.session_id}/${req.params.filename}`;

    const limiterResult = await trafficLimiter.get(primaryInstanceId);
    if (limiterResult && limiterResult.remainingPoints <= 0) {
      logger.warn(`Camera: Client ${primaryInstanceId} has used too much camera traffic.`);
      throw new TooManyRequestsError('Too much camera traffic used this month');
    }

    const bucketParams = {
      Bucket: process.env.CAMERA_STORAGE_BUCKET,
      Key: key,
    };

    const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand(bucketParams), {
      expiresIn: 6 * 60 * 60, // URL is valid 6 hours
    });

    try {
      const { data, headers } = await axios({
        url: signedUrl,
        method: 'GET',
        responseType: 'stream',
      });
      res.setHeader('content-type', headers['content-type']);
      res.setHeader('content-length', headers['content-length']);
      try {
        await trafficLimiter.consume(primaryInstanceId, headers['content-length']);
      } catch (e) {
        logger.warn(`Camera: Client ${primaryInstanceId} has used too much camera traffic. Next query will fail.`);
      }
      data.pipe(res);
    } catch (e) {
      logger.error(e);
      throw new NotFoundError('File not found');
    }
  }

  async function emptyS3Directory(bucket, dir) {
    logger.info(`Camera: Emptying folder ${bucket} / ${dir}`);
    const listParams = {
      Bucket: bucket,
      Prefix: dir,
    };

    const listedObjects = await s3Client.send(new ListObjectsCommand(listParams));

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      return;
    }

    logger.info(`Camera: Found ${listedObjects.Contents.length} files to delete`);

    const deleteParams = {
      Bucket: bucket,
      Delete: { Objects: [] },
    };

    listedObjects.Contents.forEach(({ Key }) => {
      deleteParams.Delete.Objects.push({ Key });
    });

    await s3Client.send(new DeleteObjectsCommand(deleteParams));

    if (listedObjects.IsTruncated) {
      logger.info(`Camera: Still some file to clean in ${bucket} / ${dir}. Re-cleaning.`);
      await emptyS3Directory(bucket, dir);
    }
  }

  /**
   * @api {delete} /cameras/:session_id Delete camera session
   * @apiName delete
   * @apiGroup Camera
   */
  async function cleanCameraLive(req, res) {
    validateSessionId(req.params.session_id);
    const folder = `${req.instance.id}/${req.params.session_id}`;
    await emptyS3Directory(process.env.CAMERA_STORAGE_BUCKET, folder);
    res.json({ success: true });
  }

  return {
    startStreaming: asyncMiddleware(startStreaming),
    writeCameraFile: asyncMiddleware(writeCameraFile),
    getCameraFile: asyncMiddleware(getCameraFile),
    cleanCameraLive: asyncMiddleware(cleanCameraLive),
  };
};
