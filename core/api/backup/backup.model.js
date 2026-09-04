const path = require('path');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const retry = require('async-retry');

const { NotFoundError, BadRequestError } = require('../../common/error');

const DEFAULT_BACKUP_PAGE_SIZE = 20;
const MAX_BACKUP_PAGE_SIZE = 100;
const MAX_BACKUP_PAGINATION_OFFSET = 100000;

module.exports = function BackupModel(logger, db) {
  const s3Client = new S3Client({
    forcePathStyle: false,
    endpoint: `https://${process.env.STORAGE_ENDPOINT}`,
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  async function createBackup(instanceId, url, size, status) {
    const instance = await db.t_instance.findOne({
      id: instanceId,
    });
    return db.t_backup.insert({
      account_id: instance.account_id,
      path: url,
      size,
      status,
    });
  }

  async function updateBackup(instanceId, backupId, fieldsToUpdate) {
    const instance = await db.t_instance.findOne({
      id: instanceId,
    });
    const updatedRows = await db.t_backup.update(
      {
        account_id: instance.account_id,
        id: backupId,
      },
      fieldsToUpdate,
    );
    if (updatedRows.length === 0) {
      throw new NotFoundError('Backup id was not found');
    }
    return updatedRows[0];
  }

  // skip/take come straight from the query string and massive interpolates
  // OFFSET/LIMIT in the SQL (no bind parameter), so they must be validated as integers
  function parsePaginationInteger(value, defaultValue, maxValue) {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }
    if (!/^\d+$/.test(String(value))) {
      throw new BadRequestError('skip and take must be positive integers');
    }
    return Math.min(parseInt(value, 10), maxValue);
  }

  async function getStartedBackup(instanceId, backupId) {
    const instance = await db.t_instance.findOne({
      id: instanceId,
    });
    const backup = await db.t_backup.findOne({
      account_id: instance.account_id,
      id: backupId,
      status: 'started',
    });
    if (backup === null) {
      throw new NotFoundError('Backup id was not found');
    }
    return backup;
  }

  async function get(instanceId, options = {}) {
    const offset = parsePaginationInteger(options.skip, 0, MAX_BACKUP_PAGINATION_OFFSET);
    const limit = parsePaginationInteger(options.take, DEFAULT_BACKUP_PAGE_SIZE, MAX_BACKUP_PAGE_SIZE);
    const instance = await db.t_instance.findOne({
      id: instanceId,
    });
    const backups = await db.t_backup.find(
      {
        account_id: instance.account_id,
        status: 'successed',
      },
      {
        offset,
        limit,
        order: [
          {
            field: 'created_at',
            direction: 'desc',
          },
        ],
      },
    );
    return backups;
  }

  async function getBackupPurgeList(accountId) {
    const backups = await db.t_backup.find(
      {
        account_id: accountId,
        status: 'successed',
      },
      {
        offset: 3, // 3 last backups are always kept
        order: [
          {
            field: 'created_at',
            direction: 'desc',
          },
        ],
      },
    );
    const reversedList = backups.reverse();
    const backupsToDelete = [];
    const backupsToKeep = [];
    const now = new Date();
    const sixMonthsAgo = new Date().setMonth(now.getMonth() - 6);
    const monthsHasBeenSaved = new Set();
    reversedList.forEach((backup) => {
      if (backup.created_at < sixMonthsAgo) {
        backupsToDelete.push(backup);
        return null;
      }
      const currentBackupMonth = backup.created_at.toISOString().substr(0, 7);
      if (monthsHasBeenSaved.has(currentBackupMonth)) {
        backupsToDelete.push(backup);
      } else {
        backupsToKeep.push(backup);
        monthsHasBeenSaved.add(currentBackupMonth);
      }
      return null;
    });
    return {
      backupsToDelete,
      backupsToKeep,
    };
  }

  async function deleteBackup(backupId, backupUrl) {
    const key = path.basename(backupUrl);
    try {
      const RETRY_CONFIG = {
        retries: 5,
      };
      // we want to retry with expontential backoff, in case the delete fails
      await retry(async () => {
        await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }));
      }, RETRY_CONFIG);
    } catch (e) {
      logger.warn(`Fail to delete backup in S3 storage: ${backupId} ${backupUrl}`);
      logger.warn(e);
    }
    await db.t_backup.destroy({ id: backupId });
  }

  return {
    createBackup,
    get,
    getStartedBackup,
    updateBackup,
    getBackupPurgeList,
    deleteBackup,
  };
};
