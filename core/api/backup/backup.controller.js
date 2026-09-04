const path = require('path');
const crypto = require('crypto');
const {
  S3Client,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand, UploadPartCommand } = require('@aws-sdk/client-s3');
const Promise = require('bluebird');

const asyncMiddleware = require('../../middleware/asyncMiddleware');
const { BadRequestError } = require('../../common/error');

const ENABLE_SIGNED_URL_BACKUPS = process.env.ENABLE_SIGNED_URL_BACKUPS === 'true';

const MAX_FILE_SIZE_IN_BYTES = parseInt(process.env.BACKUP_MAX_FILE_SIZE_IN_BYTES, 10);

const CHUNK_SIZE_IN_BYTES = parseInt(process.env.BACKUP_CHUNK_SIZE_IN_BYTES, 10);

module.exports = function BackupController(backupModel, accountModel, logger) {
  const s3Client = new S3Client({
    forcePathStyle: false,
    endpoint: `https://${process.env.STORAGE_ENDPOINT}`,
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
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
      const signedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: process.env.STORAGE_BUCKET,
          Key: key,
        }),
        { expiresIn: 6 * 60 * 60 },
      ); // URL is valid 6 hours
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
    const fileSize = req.body.file_size;
    if (!Number.isInteger(fileSize) || fileSize <= 0) {
      throw new BadRequestError('file_size must be a positive integer');
    }

    if (fileSize > MAX_FILE_SIZE_IN_BYTES) {
      throw new BadRequestError(`File is too large. Maximum file size is ${MAX_FILE_SIZE_IN_BYTES / 1024 / 1024} MB.`);
    }

    // Generate file destination ID
    const name = `${crypto.randomUUID()}.enc`;
    const numberOfParts = Math.ceil(fileSize / CHUNK_SIZE_IN_BYTES);

    const multipartParams = {
      Bucket: process.env.STORAGE_BUCKET,
      Key: name,
      ACL: ENABLE_SIGNED_URL_BACKUPS ? 'private' : 'public-read',
    };

    const multipartUpload = await s3Client.send(new CreateMultipartUploadCommand(multipartParams));

    // Generate all signed urls for the upload
    const tasks = new Array(numberOfParts);
    const parts = await Promise.map(
      tasks,
      async (task, index) => {
        const signedUrl = await getSignedUrl(
          s3Client,
          new UploadPartCommand({
            Bucket: process.env.STORAGE_BUCKET,
            Key: multipartUpload.Key,
            UploadId: multipartUpload.UploadId,
            PartNumber: index + 1,
          }),
          { expiresIn: 15 * 60 * 60 },
        ); // URL is valid for 15 hours
        return {
          signed_url: signedUrl,
          part_number: index + 1,
        };
      },
      { concurrency: 10 },
    );

    // create backup in database with "started" type. The S3 key is saved with it so
    // finalize/abort can only touch the upload this account started.
    const backup = await backupModel.createBackup(req.instance.id, multipartUpload.Key, fileSize, 'started');

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
  // The S3 key is never taken from the request body: it is the one saved when this
  // account initialized the upload, so an instance cannot complete or abort an
  // upload belonging to another account, nor point its backup to another account's file.
  async function getStartedBackupKey(instanceId, backupId, fileKeyFromBody) {
    const backup = await backupModel.getStartedBackup(instanceId, backupId);
    if (!backup.path) {
      // upload started before the key was saved with the backup: it cannot be trusted
      throw new BadRequestError('This upload cannot be resumed, please start a new backup');
    }
    if (fileKeyFromBody !== undefined && fileKeyFromBody !== backup.path) {
      throw new BadRequestError('file_key does not match this backup');
    }
    return backup.path;
  }

  async function finalizeMultipartUpload(req, res) {
    if (!Array.isArray(req.body.parts)) {
      throw new BadRequestError('parts must be an array');
    }

    const fileKey = await getStartedBackupKey(req.instance.id, req.body.backup_id, req.body.file_key);

    // ordering the parts to make sure they are in the right order
    const partsOrdered = req.body.parts.sort((a, b) => a.PartNumber - b.PartNumber);

    const multipartParams = {
      Bucket: process.env.STORAGE_BUCKET,
      Key: fileKey,
      UploadId: req.body.file_id,
      MultipartUpload: {
        Parts: partsOrdered,
      },
    };

    await s3Client.send(new CompleteMultipartUploadCommand(multipartParams));
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: fileKey,
      }),
    );
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
    const fileKey = await getStartedBackupKey(req.instance.id, req.body.backup_id, req.body.file_key);

    const multipartParams = {
      Bucket: process.env.STORAGE_BUCKET,
      Key: fileKey,
      UploadId: req.body.file_id,
    };

    await s3Client.send(new AbortMultipartUploadCommand(multipartParams));

    const backup = await backupModel.updateBackup(req.instance.id, req.body.backup_id, {
      status: 'failed',
      path: null,
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
