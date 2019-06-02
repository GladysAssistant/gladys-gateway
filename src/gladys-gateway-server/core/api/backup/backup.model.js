module.exports = function BackupModel(logger, db) {
  async function createBackup(instanceId, path, size) {
    const instance = await db.t_instance.findOne({
      id: instanceId,
    });
    await db.t_backup.insert({
      account_id: instance.account_id,
      path,
      size,
    });
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
      },
    );
    return backups;
  }

  return {
    createBackup,
    get,
  };
};
