const aws = require('aws-sdk');
const axios = require('axios');

const asyncMiddleware = require('../../middleware/asyncMiddleware');
const { NotFoundError, BadRequestError } = require('../../common/error');

aws.config.update({
  signatureVersion: 'v4',
  signatureCache: false,
});

module.exports = function CameraController(logger, userModel, instanceModel) {
  const spacesEndpoint = new aws.Endpoint(process.env.STORAGE_ENDPOINT);

  const s3 = new aws.S3({
    endpoint: spacesEndpoint,
  });

  const SESSION_ID_REGEX = /^camera-[a-zA-Z0-9-_]+$/;

  // Session_id usually looks like "camera-7835d25d-b8ce-4824-a235-23637f778f83-39-50-13"
  const validateSessionId = (sessionId) => {
    if (!SESSION_ID_REGEX.test(sessionId)) {
      throw new BadRequestError('Invalid session id');
    }
  };

  const AUTHORIZED_FILENAMES = ['index.m3u8', 'index.m3u8.key', 'key_info_file.txt'];
  const HLS_CHUNK_REGEX = /index[0-9]+.ts/;

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
    const key = `${req.instance.id}/${req.params.session_id}/${req.params.filename}`;
    await s3
      .putObject({
        Bucket: process.env.CAMERA_STORAGE_BUCKET,
        Key: key,
        Body: req.body,
      })
      .promise();
    res.json({
      success: true,
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
    const user = await userModel.getMySelf({ id: req.user.id });
    const primaryInstance = await instanceModel.getPrimaryInstanceByAccount(user.account_id);
    const key = `${primaryInstance.id}/${req.params.session_id}/${req.params.filename}`;
    const signedUrl = await s3.getSignedUrlPromise('getObject', {
      Bucket: process.env.CAMERA_STORAGE_BUCKET,
      Key: key,
      Expires: 6 * 60 * 60, // URL is valid 6 hours
    });
    try {
      const { data, headers } = await axios({
        url: signedUrl,
        method: 'GET',
        responseType: 'stream',
      });
      res.setHeader('content-type', headers['content-type']);
      res.setHeader('content-length', headers['content-length']);
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

    const listedObjects = await s3.listObjectsV2(listParams).promise();
    logger.info(`Camera: Found ${listedObjects.Contents.length} files to delete`);

    if (listedObjects.Contents.length === 0) {
      return;
    }

    const deleteParams = {
      Bucket: bucket,
      Delete: { Objects: [] },
    };

    listedObjects.Contents.forEach(({ Key }) => {
      deleteParams.Delete.Objects.push({ Key });
    });

    await s3.deleteObjects(deleteParams).promise();

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
    writeCameraFile: asyncMiddleware(writeCameraFile),
    getCameraFile: asyncMiddleware(getCameraFile),
    cleanCameraLive: asyncMiddleware(cleanCameraLive),
  };
};
