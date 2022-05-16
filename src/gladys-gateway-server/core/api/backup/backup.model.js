const path = require('path');
const aws = require('aws-sdk');
const retry = require('async-retry');

const { NotFoundError } = require('../../common/error.js');

module.exports = function BackupModel(logger, db) {
  const spacesEndpoint = new aws.Endpoint(process.env.STORAGE_ENDPOINT);
  const s3 = new aws.S3({
    endpoint: spacesEndpoint,
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

  async function get(instanceId, options) {
    const offset = options.skip || 0;
    const limit = options.take || 20;
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
        await s3.deleteObject({ Bucket: process.env.STORAGE_BUCKET, Key: key }).promise();
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
    updateBackup,
    getBackupPurgeList,
    deleteBackup,
  };
};
