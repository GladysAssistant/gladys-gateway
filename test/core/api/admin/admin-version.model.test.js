const { expect } = require('chai');
const AdminVersionModel = require('../../../../core/api/admin/admin-version.model');
const { AlreadyExistError } = require('../../../../core/common/error');

const logger = { warn: () => {}, info: () => {}, debug: () => {} };

describe('AdminVersionModel.createVersion', () => {
  it('should return 409 when a concurrent insert wins the race on the unique index', async () => {
    const uniqueViolation = new Error('duplicate key value violates unique constraint');
    uniqueViolation.code = '23505';
    const db = {
      t_gladys_version: {
        findOne: async () => null,
        insert: async () => {
          throw uniqueViolation;
        },
      },
    };
    const adminVersionModel = AdminVersionModel(logger, db);
    await expect(adminVersionModel.createVersion({ name: 'v4.58.0' })).to.be.rejectedWith(AlreadyExistError);
  });

  it('should rethrow other database errors', async () => {
    const dbError = new Error('connection lost');
    const db = {
      t_gladys_version: {
        findOne: async () => null,
        insert: async () => {
          throw dbError;
        },
      },
    };
    const adminVersionModel = AdminVersionModel(logger, db);
    await expect(adminVersionModel.createVersion({ name: 'v4.58.0' })).to.be.rejectedWith('connection lost');
  });
});
