const geoip = require('geoip-lite');
const get = require('get-value');
const asyncMiddleware = require('./asyncMiddleware.js');

module.exports = function GladysUsage(logger, db) {
  return asyncMiddleware(async (req, res, next) => {
    try {
      const geo = geoip.lookup(req.ip);
      let userAgent = req.headers['user-agent'];
      if (userAgent && userAgent.length) {
        userAgent = userAgent.substr(0, 30);
      }
      const gladysUsagePoint = {
        client_id: req.query.client_id,
        user_agent: userAgent,
        event_type: 'get-gladys-version',
        country: get(geo, 'country'),
        region: get(geo, 'region'),
        timezone: get(geo, 'timezone'),
        region_latitude: geo && Math.round(geo.ll[0]),
        region_longitude: geo && Math.round(geo.ll[1]),
      };
      // we insert the data point but don't wait for it to complete
      db.t_gladys_usage.insert(gladysUsagePoint);
    } catch (e) {
      logger.warn(e);
    }
    next();
  });
};
