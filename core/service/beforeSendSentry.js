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

function beforeSend(event) {
  return omitDeep(event, PROPERTIES_TO_OMIT);
}

module.exports = beforeSend;
