const omitDeep = require('omit-deep');

const SENSIBLE_FIELDS = ['alt', 'batt', 'conn', 'lat', 'lon', 'tid', 'tst', 'vac', 'vel'];

function beforeSend(event) {
  return omitDeep(event, SENSIBLE_FIELDS);
}

module.exports = beforeSend;
