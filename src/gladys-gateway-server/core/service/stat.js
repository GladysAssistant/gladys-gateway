const massive = require('massive');

module.exports = async function StatService(logger) {
  let db = null;
  if (process.env.POSTGRESQL_STAT_DATABASE) {
    db = await massive({
      host: process.env.POSTGRESQL_HOST,
      port: process.env.POSTGRESQL_PORT,
      database: process.env.POSTGRESQL_STAT_DATABASE,
      user: process.env.POSTGRESQL_USER,
      password: process.env.POSTGRESQL_PASSWORD,
    });
  }

  async function track(eventName, data) {
    if (db !== null) {
      try {
        await db.t_stat.insert({
          event_type: eventName,
          payload: data,
        });
      } catch (e) {
        logger.warn('Unable to save stat in DB');
        logger.warn(e);
      }
    }
  }

  return {
    track,
  };
};
