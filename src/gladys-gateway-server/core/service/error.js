const omitDeep = require('omit-deep');

const PROPERTIES_TO_OMIT = [
  'password',
  'latitude',
  'longitude',
  'accuracy',
  'altitude',
  'device_battery',
  'lon',
  'lat',
  'acc',
  'alt',
  'batt',
];

module.exports = async function ErrorService(logger, statDb) {
  async function track(eventName, data) {
    if (statDb) {
      try {
        const cleanPayload = omitDeep(data, PROPERTIES_TO_OMIT);
        logger.error(cleanPayload);
        await statDb.t_error.insert({
          event_type: eventName,
          payload: cleanPayload,
        });
      } catch (e) {
        logger.warn('Unable to save error in DB');
        logger.warn(e);
      }
    }
  }

  return {
    track,
  };
};
