const { NotFoundError } = require('../../common/error');

module.exports = function VersionModel(logger, db) {
  /**
   * Getting the last version of Gladys reported in DB
   */
  async function getCurrentVersion() {
    const versions = await db.t_gladys_version.find(
      { active: true },
      {
        order: [
          {
            field: 'created_at',
            direction: 'desc',
          },
        ],
        fields: ['name', 'created_at', 'default_release_note_link', 'fr_release_note_link'],
      },
    );
    if (versions.length === 0) {
      throw new NotFoundError();
    }

    return versions[0];
  }

  return {
    getCurrentVersion,
  };
};
