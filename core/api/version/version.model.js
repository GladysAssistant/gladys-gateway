const { NotFoundError } = require('../../common/error');
const { callOptionalRedisCommand } = require('../../common/redis');
const {
  CURRENT_GLADYS_VERSION_CACHE_KEY,
  CURRENT_GLADYS_VERSION_CACHE_EXPIRY_IN_SECONDS,
} = require('../../common/gladys-version-cache');

module.exports = function VersionModel(logger, db, redisClient) {
  // The cache is only a shortcut: when Redis fails, the version is read in database
  async function getCurrentVersionFromCache() {
    try {
      const versionInCache = await callOptionalRedisCommand(redisClient, () =>
        redisClient.get(CURRENT_GLADYS_VERSION_CACHE_KEY),
      );
      return versionInCache ? JSON.parse(versionInCache) : null;
    } catch (e) {
      logger.warn(`Unable to read the current Gladys version cache (${e.message})`);
      return null;
    }
  }

  /**
   * Getting the last version of Gladys reported in DB
   */
  async function getCurrentVersion() {
    const versionInCache = await getCurrentVersionFromCache();
    if (versionInCache) {
      return versionInCache;
    }
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
        limit: 1,
      },
    );
    if (versions.length === 0) {
      throw new NotFoundError();
    }
    // not awaited: the response does not wait for Redis to cache the version
    callOptionalRedisCommand(redisClient, () =>
      redisClient.set(CURRENT_GLADYS_VERSION_CACHE_KEY, JSON.stringify(versions[0]), {
        EX: CURRENT_GLADYS_VERSION_CACHE_EXPIRY_IN_SECONDS,
      }),
    ).catch((e) => {
      logger.warn(`Unable to cache the current Gladys version (${e.message})`);
    });

    return versions[0];
  }

  return {
    getCurrentVersion,
  };
};
