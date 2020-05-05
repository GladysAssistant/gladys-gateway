module.exports = async function StatService(logger, statDb) {
  async function track(eventName, data) {
    if (statDb) {
      try {
        await statDb.t_stat.insert({
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
