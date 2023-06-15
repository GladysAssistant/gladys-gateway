const path = require('path');
const aws = require('aws-sdk');
const Promise = require('bluebird');
const uuid = require('uuid');

const asyncMiddleware = require('../../middleware/asyncMiddleware');
const { BadRequestError } = require('../../common/error');

aws.config.update({
  signatureVersion: 'v4',
  signatureCache: false,
});

const ENABLE_SIGNED_URL_BACKUPS = process.env.ENABLE_SIGNED_URL_BACKUPS === 'true';

const MAX_FILE_SIZE_IN_BYTES = parseInt(process.env.BACKUP_MAX_FILE_SIZE_IN_BYTES, 10);

const CHUNK_SIZE_IN_BYTES = parseInt(process.env.BACKUP_CHUNK_SIZE_IN_BYTES, 10);

module.exports = function BackupController(backupModel, accountModel, logger) {
  const spacesEndpoint = new aws.Endpoint(process.env.STORAGE_ENDPOINT);

  const s3 = new aws.S3({
    endpoint: spacesEndpoint,
  });

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
      // MAX_SAFE_INTEGER is the equivalent of 9000 GB
      // So we are safe to convert here to JS integer
      const newSize = parseInt(backup.size, 10);
      return {
        ...backup,
        size: newSize,
        path: ENABLE_SIGNED_URL_BACKUPS ? signedUrl : backup.path,
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
    const numberOfParts = Math.ceil(req.body.file_size / CHUNK_SIZE_IN_BYTES);

    if (req.body.file_size > MAX_FILE_SIZE_IN_BYTES) {
      throw new BadRequestError(`File is too large. Maximum file size is ${MAX_FILE_SIZE_IN_BYTES / 1024 / 1024} MB.`);
    }

    const multipartParams = {
      Bucket: process.env.STORAGE_BUCKET,
      Key: name,
      ACL: ENABLE_SIGNED_URL_BACKUPS ? 'private' : 'public-read',
    };

    const multipartUpload = await s3.createMultipartUpload(multipartParams).promise();

    // Generate all signed urls for the upload
    const multipartParamsSignedUrl = {
      Bucket: process.env.STORAGE_BUCKET,
      Key: multipartUpload.Key,
      UploadId: multipartUpload.UploadId,
      Expires: 15 * 60 * 60, // URL is valid for 15 hours
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

    // create backup in database with "started" type
    const backup = await backupModel.createBackup(req.instance.id, null, req.body.file_size, 'started');

    res.send({
      file_id: multipartUpload.UploadId,
      file_key: multipartUpload.Key,
      parts,
      chunk_size: CHUNK_SIZE_IN_BYTES,
      backup_id: backup.id,
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
    // ordering the parts to make sure they are in the right order
    const partsOrdered = req.body.parts.sort((a, b) => a.PartNumber - b.PartNumber);

    const multipartParams = {
      Bucket: process.env.STORAGE_BUCKET,
      Key: req.body.file_key,
      UploadId: req.body.file_id,
      MultipartUpload: {
        Parts: partsOrdered,
      },
    };

    await s3.completeMultipartUpload(multipartParams).promise();
    const signedUrl = await s3.getSignedUrlPromise('getObject', {
      Bucket: process.env.STORAGE_BUCKET,
      Key: req.body.file_key,
    });
    const backup = await backupModel.updateBackup(req.instance.id, req.body.backup_id, {
      status: 'successed',
      path: signedUrl.split('?')[0],
    });
    res.send({
      signed_url: signedUrl,
      backup,
    });
  }

  /**
   * @api {post} /backups/multi_parts/abort Abort upload
   * @apiName abortMultiPartUpload
   * @apiGroup Backup
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": "failed"
   * }
   */
  async function abortMultiPartUpload(req, res) {
    const multipartParams = {
      Bucket: process.env.STORAGE_BUCKET,
      Key: req.body.file_key,
      UploadId: req.body.file_id,
    };

    await s3.abortMultipartUpload(multipartParams).promise();

    const backup = await backupModel.updateBackup(req.instance.id, req.body.backup_id, {
      status: 'failed',
    });

    res.send(backup);
  }

  async function purgeBackups(req, res) {
    const executeDelete = req.body.execute_delete === true;
    const accounts = await accountModel.getAllAccounts();
    logger.info(`PurgeBackups: Found ${accounts.length} to check for purge backups`);
    const result = await Promise.mapSeries(accounts, async (account) => {
      logger.info(`PurgeBackups: account ${account.name}`);
      const { backupsToDelete, backupsToKeep } = await backupModel.getBackupPurgeList(account.id);
      logger.info(`PurgeBackups: Found ${backupsToDelete.length} to delete`);
      logger.info(`PurgeBackups: Found ${backupsToKeep.length} to keep (+3 most recent backups)`);
      if (executeDelete) {
        await Promise.map(
          backupsToDelete,
          async (backup) => {
            await backupModel.deleteBackup(backup.id, backup.path);
          },
          { concurrency: 10 },
        );
      }
      return {
        id: account.id,
        nb_backups_to_keep: backupsToKeep.length,
        nb_backups_to_delete: backupsToDelete.length,
      };
    });
    res.json(result);
  }

  return {
    get: asyncMiddleware(get),
    initializeMultipartUpload: asyncMiddleware(initializeMultipartUpload),
    finalizeMultipartUpload: asyncMiddleware(finalizeMultipartUpload),
    abortMultiPartUpload: asyncMiddleware(abortMultiPartUpload),
    purgeBackups: asyncMiddleware(purgeBackups),
  };
};
