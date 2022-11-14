const { Batcher } = require('bottleneck');

module.exports = async function StatService(logger, statDb) {
  const batcher = new Batcher({
    maxTime: 5 * 1000, // every 5 seconds flush to DB
    maxSize: 200,
  });
  batcher.on('batch', async (rows) => {
    if (statDb) {
      try {
        await statDb.t_stat.insert(rows);
      } catch (e) {
        logger.warn('Unable to save stat in DB');
        logger.warn(e);
      }
    }
  });
  async function track(eventName, data) {
    try {
      batcher.add({
        event_type: eventName,
        payload: data,
      });
    } catch (e) {
      logger.warn('Unable to add event to batch');
      logger.warn(e);
    }
  }

  return {
    track,
  };
};
