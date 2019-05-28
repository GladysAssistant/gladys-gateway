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

  return {
    createBackup,
  };
};
