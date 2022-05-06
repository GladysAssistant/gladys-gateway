const path = require('path');
const aws = require('aws-sdk');
const multer = require('multer');
const Promise = require('bluebird');
const multerS3 = require('multer-s3');
const uuid = require('uuid');

const asyncMiddleware = require('../../middleware/asyncMiddleware.js');

aws.config.update({
  signatureVersion: 'v4',
  signatureCache: false,
});

const MAX_FILE_SIZE_IN_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

const CHUNK_SIZE = 10 * 1024; // 10Mo

module.exports = function BackupController(backupModel, logger) {
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
  /**
   * @api {post} /backups Create new Gladys backup
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
        const url = file.location.startsWith('https://') ? file.location : `https://${file.location}`;
        await backupModel.createBackup(req.instance.id, url, file.size);
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

  /**
   * @api {get} /backups Get all backups
   * @apiName get
   * @apiGroup Backup
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * [{
   *   "path": "http://backup-url",
   *    "size": 12
   * }]
   */
  async function get(req, res, next) {
    const backups = await backupModel.get(req.instance.id, req.query);
    const backupsWithSignedUrls = await Promise.map(backups, async (backup) => {
      const key = path.basename(backup.path);
      const signedUrl = await s3.getSignedUrlPromise('getObject', {
        Bucket: process.env.STORAGE_BUCKET,
        Key: key,
        Expires: 6 * 60 * 60, // URL is valid 6 hours
      });
      return {
        ...backup,
        path: signedUrl,
      };
    });
    res.json(backupsWithSignedUrls);
  }

  /**
   * @api {post} /backups/multi_parts/initiliaze Initialize new multi-part upload
   * @apiName initMultiPartBackup
   * @apiGroup Backup
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "file_id": "",
   *   "file_key": ""
   * }
   */
  async function initializeMultipartUpload(req, res) {
    // Generate file destination ID
    const name = `${uuid.v4()}.enc`;
    const numberOfParts = Math.ceil(req.body.file_size / CHUNK_SIZE);

    const multipartParams = {
      Bucket: process.env.STORAGE_BUCKET,
      Key: name,
      ACL: 'private',
    };

    const multipartUpload = await s3.createMultipartUpload(multipartParams).promise();

    // Generate all signed urls for the upload
    const multipartParamsSignedUrl = {
      Bucket: process.env.STORAGE_BUCKET,
      Key: multipartUpload.Key,
      UploadId: multipartUpload.UploadId,
      Expires: 10 * 60 * 60, // URL is valid for 10 hours
    };

    const tasks = new Array(numberOfParts);
    const parts = await Promise.map(
      tasks,
      async (task, index) => {
        const signedUrl = await s3.getSignedUrlPromise('uploadPart', {
          ...multipartParamsSignedUrl,
          PartNumber: index + 1,
        });
        return {
          signed_url: signedUrl,
          part_number: index + 1,
        };
      },
      { concurrency: 10 },
    );

    res.send({
      file_id: multipartUpload.UploadId,
      file_key: multipartUpload.Key,
      parts,
      chunk_size: CHUNK_SIZE,
    });
  }

  /**
   * @api {post} /backups/multi_parts/finalize Finalize upload
   * @apiName finalizeMultiPartUpload
   * @apiGroup Backup
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "success": true
   * }
   */
  async function finalizeMultipartUpload(req, res) {
    const multipartParams = {
      Bucket: process.env.STORAGE_BUCKET,
      Key: req.body.file_key,
      UploadId: req.body.file_id,
      MultipartUpload: {
        // ordering the parts to make sure they are in the right order
        Parts: req.body.parts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    };

    await s3.completeMultipartUpload(multipartParams).promise();
    const signedUrl = await s3.getSignedUrlPromise('getObject', {
      Bucket: process.env.STORAGE_BUCKET,
      Key: req.body.file_key,
    });
    res.send({
      signed_url: signedUrl,
    });
  }

  return {
    create: asyncMiddleware(create),
    get: asyncMiddleware(get),
    initializeMultipartUpload: asyncMiddleware(initializeMultipartUpload),
    finalizeMultipartUpload: asyncMiddleware(finalizeMultipartUpload),
  };
};
