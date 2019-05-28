const path = require('path');
const aws = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const uuid = require('uuid');

const asyncMiddleware = require('../../middleware/asyncMiddleware.js');

const MAX_FILE_SIZE_IN_BYTES = 50000000; // 50 MB

const spacesEndpoint = new aws.Endpoint(process.env.STORAGE_ENDPOINT);
const s3 = new aws.S3({
  endpoint: spacesEndpoint,
});

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.STORAGE_BUCKET,
    acl: 'public-read',
    key: (request, file, cb) => {
      const newFileName = `${uuid.v4()}.enc`;
      cb(null, newFileName);
    },
  }),
  limits: {
    fileSize: MAX_FILE_SIZE_IN_BYTES,
  },
  fileFilter: (req, file, cb) => {
    // file should be a .enc backup file.
    if (path.extname(file.originalname) !== '.enc') {
      return cb(null, false);
    }
    // if all good, file is good to be uploaded
    return cb(null, true);
  },
}).array('upload', 1);

module.exports = function BackupController(backupModel, logger) {
  /**
   * @api {post} /backup Create new Gladys backup
   * @apiName createBackup
   * @apiGroup Backup
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  async function create(req, res, next) {
    upload(req, res, async (error) => {
      if (error && error instanceof multer.MulterError) {
        logger.warn(error);
        return res.status(400).json({
          status: 400,
          error_code: error.code,
          error_message: error.message,
        });
      }
      if (error) {
        logger.warn(error);
        return res.status(400).json({
          status: 400,
          error_message: 'Upload failed.',
        });
      }
      try {
        const file = req.files[0];
        await backupModel.createBackup(req.instance.id, file.location, file.size);
        return res.json({ status: 200 });
      } catch (e) {
        logger.warn(e);
        return res.status(400).json({
          status: 400,
          error_message: 'Upload failed. You must upload an encrypted backup file.',
        });
      }
    });
  }

  return {
    create: asyncMiddleware(create),
  };
};
