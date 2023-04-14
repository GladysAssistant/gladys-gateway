const aws = require('aws-sdk');
const axios = require('axios');

const asyncMiddleware = require('../../middleware/asyncMiddleware');
const { NotFoundError } = require('../../common/error');

aws.config.update({
  signatureVersion: 'v4',
  signatureCache: false,
});

module.exports = function CameraController(logger, userModel, instanceModel) {
  const spacesEndpoint = new aws.Endpoint(process.env.STORAGE_ENDPOINT);

  const s3 = new aws.S3({
    endpoint: spacesEndpoint,
  });

  /**
   * @api {post} /cameras/:session_id/:filename Write camera file
   * @apiName post
   * @apiGroup Camera
   */
  async function writeCameraFile(req, res, next) {
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

  return {
    writeCameraFile: asyncMiddleware(writeCameraFile),
    getCameraFile: asyncMiddleware(getCameraFile),
  };
};
