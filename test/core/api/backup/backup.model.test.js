const { expect } = require('chai');
const tracer = require('tracer');

const BackupModel = require('../../../../core/api/backup/backup.model');

const logger = tracer.colorConsole({
  level: process.env.LOG_LEVEL || 'debug',
});

describe('backupModel', () => {
  it('should return list of backups to purge', async () => {
    const arr = [];
    const now = new Date();
    await TEST_DATABASE_INSTANCE.t_backup.destroy({ account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def' });
    for (let i = 0; i < 364; i += 1) {
      const date = new Date(new Date().setDate(now.getDate() - i));
      arr.push({
        account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
        path: 'https://path.com',
        size: 100,
        status: 'successed',
        created_at: date,
        updated_at: date,
      });
    }
    await TEST_DATABASE_INSTANCE.t_backup.insert(arr);
    const backupModel = BackupModel(logger, TEST_DATABASE_INSTANCE);
    const res = await backupModel.getBackupPurgeList('b2d23f66-487d-493f-8acb-9c8adb400def');
    expect(res).to.have.property('backupsToDelete');
    expect(res).to.have.property('backupsToKeep');
    expect(res.backupsToKeep).to.satisfy((toKeep) => toKeep.length <= 7);
    const expectedLength = 365 - 7 - 3;
    expect(res.backupsToDelete).to.satisfy(
      (list) => list.length >= expectedLength - 3 && list.length <= expectedLength + 3,
    );
  });
});
