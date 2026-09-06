const Joi = require('joi');
const { NotFoundError, AlreadyExistError, ValidationError } = require('../../common/error');
const { adminCreateGladysVersionSchema, adminUpdateGladysVersionSchema } = require('../../common/schema');

const uuidSchema = Joi.string().guid({ version: 'uuidv4' }).required();

// PostgreSQL error code for unique_violation
const UNIQUE_VIOLATION_ERROR_CODE = '23505';

const VERSION_FIELDS = [
  'id',
  'name',
  'active',
  'default_release_note_link',
  'fr_release_note_link',
  'created_at',
  'updated_at',
];

module.exports = function AdminVersionModel(logger, db) {
  async function listVersions() {
    return db.t_gladys_version.find(
      {},
      { fields: VERSION_FIELDS, order: [{ field: 'created_at', direction: 'desc' }] },
    );
  }

  /**
   * Create a new Gladys version. The most recent active version is the one returned to
   * Gladys instances by GET /v1/api/gladys/version. Creating a version whose name already
   * exists is a 409, which makes the call idempotent from the release GitHub Action.
   */
  async function createVersion(data) {
    const { error, value } = adminCreateGladysVersionSchema.validate(data, { stripUnknown: true, abortEarly: false });
    if (error) {
      throw new ValidationError('gladys_version', error);
    }
    const existingVersion = await db.t_gladys_version.findOne({ name: value.name });
    if (existingVersion !== null) {
      throw new AlreadyExistError('gladys_version', value.name);
    }
    let version;
    try {
      version = await db.t_gladys_version.insert(value, { fields: VERSION_FIELDS });
    } catch (e) {
      // two concurrent calls with the same name: the unique index catches the race
      if (e && e.code === UNIQUE_VIOLATION_ERROR_CODE) {
        throw new AlreadyExistError('gladys_version', value.name);
      }
      throw e;
    }
    logger.warn(`Admin API: Gladys version ${version.name} created (active: ${version.active})`);
    return version;
  }

  async function updateVersion(versionId, data) {
    if (uuidSchema.validate(versionId).error) {
      throw new NotFoundError('Version not found');
    }
    const { error, value } = adminUpdateGladysVersionSchema.validate(data, { stripUnknown: true, abortEarly: false });
    if (error) {
      throw new ValidationError('gladys_version', error);
    }
    const [version] = await db.t_gladys_version.update({ id: versionId }, value, { fields: VERSION_FIELDS });
    if (!version) {
      throw new NotFoundError('Version not found');
    }
    logger.warn(`Admin API: Gladys version ${version.name} updated (${Object.keys(value).join(', ')})`);
    return version;
  }

  return {
    listVersions,
    createVersion,
    updateVersion,
  };
};
