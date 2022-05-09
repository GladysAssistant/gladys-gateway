const { NotFoundError } = require('../../common/error.js');

module.exports = function BackupModel(logger, db) {
  async function createBackup(instanceId, path, size, status) {
    const instance = await db.t_instance.findOne({
      id: instanceId,
    });
    return db.t_backup.insert({
      account_id: instance.account_id,
      path,
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

  return {
    createBackup,
    get,
    updateBackup,
  };
};
