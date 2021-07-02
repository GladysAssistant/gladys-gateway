const { Batcher } = require('bottleneck');
const omitDeep = require('omit-deep');
const { ForbiddenError, UnauthorizedError, NotFoundError } = require('../common/error');

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
  const batcher = new Batcher({
    maxTime: 5 * 1000, // every 5 seconds flush to DB
    maxSize: 200,
  });
  batcher.on('batch', async (rows) => {
    if (statDb) {
      try {
        await statDb.t_error.insert(rows);
      } catch (e) {
        logger.warn('Unable to save error in DB');
        logger.warn(e);
      }
    }
  });
  async function track(eventName, data) {
    try {
      if (
        data.error &&
        !(data.error instanceof ForbiddenError) &&
        !(data.error instanceof UnauthorizedError) &&
        !(data.error instanceof NotFoundError)
      ) {
        const cleanPayload = omitDeep(data, PROPERTIES_TO_OMIT);
        logger.error(cleanPayload);
        batcher.add({
          event_type: eventName,
          payload: cleanPayload,
        });
      }
    } catch (e) {
      logger.warn('Unable to add error to batcher');
      logger.warn(e);
    }
  }

  return {
    track,
  };
};
