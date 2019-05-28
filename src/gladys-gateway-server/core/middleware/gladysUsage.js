const geoip = require('geoip-lite');
const get = require('get-value');
const asyncMiddleware = require('./asyncMiddleware.js');

module.exports = function GladysUsage(logger, db) {
  return asyncMiddleware(async (req, res, next) => {
    next();
    try {
      const geo = geoip.lookup(req.ip);
      let userAgent = req.headers['user-agent'];
      let { system } = req.query;
      let nodeVersion = req.query.node_version;
      if (userAgent && userAgent.length) {
        userAgent = userAgent.substr(0, 30);
      }
      if (system && system.length) {
        system = system.substr(0, 30);
      }
      if (nodeVersion && nodeVersion.length) {
        nodeVersion = nodeVersion.substr(0, 30);
      }
      const gladysUsagePoint = {
        client_id: req.query.client_id,
        user_agent: userAgent,
        event_type: 'get-gladys-version',
        country: get(geo, 'country'),
        region: get(geo, 'region'),
        timezone: get(geo, 'timezone'),
        system,
        node_version: nodeVersion,
        is_docker: req.query.is_docker,
        region_latitude: geo && Math.round(geo.ll[0]),
        region_longitude: geo && Math.round(geo.ll[1]),
      };
      await db.t_gladys_usage.insert(gladysUsagePoint);
    } catch (e) {
      logger.warn(e);
    }
  });
};
