const geoip = require('geoip-lite');
const get = require('get-value');
const asyncMiddleware = require('./asyncMiddleware');

// Only API calls made by a Gladys 4+ instance are recorded (User-Agent "Gladys/v4.57.0", or a
// pre-release like "Gladys/v4.0.0-beta-13"). Crawlers and link previews (facebookexternalhit...)
// also hit this route, as well as bots and AI agents running Gladys from source, which send
// "Gladys/vundefined", "Gladys/v1.0.0" or "Gladys/v4.54.0 Geminibot".
const GLADYS_USER_AGENT_REGEX = /^Gladys\/v([4-9]|[1-9]\d+)\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

module.exports = function GladysUsage(logger, db) {
  return asyncMiddleware(async (req, res, next) => {
    next();
    try {
      if (!GLADYS_USER_AGENT_REGEX.test(req.headers['user-agent'] || '')) {
        return;
      }
      const data = { ...req.query, ...req.body };
      const geo = geoip.lookup(req.ip);
      let userAgent = req.headers['user-agent'];
      let { system } = data;
      let nodeVersion = data.node_version;
      let deviceStateCount = null;
      if (userAgent && userAgent.length) {
        userAgent = userAgent.substr(0, 30);
      }
      if (system && system.length) {
        system = system.substr(0, 30);
      }
      if (nodeVersion && nodeVersion.length) {
        nodeVersion = nodeVersion.substr(0, 30);
      }
      if (data.device_state_count && !Number.isNaN(data.device_state_count)) {
        deviceStateCount = data.device_state_count;
      }
      const gladysUsagePoint = {
        client_id: data.client_id,
        user_agent: userAgent,
        event_type: 'get-gladys-version',
        country: get(geo, 'country'),
        region: get(geo, 'region'),
        timezone: get(geo, 'timezone'),
        system,
        node_version: nodeVersion,
        is_docker: data.is_docker,
        region_latitude: geo && Math.round(geo.ll[0]),
        region_longitude: geo && Math.round(geo.ll[1]),
        device_state_count: deviceStateCount,
        integrations: data.integrations,
      };
      await db.t_gladys_usage.insert(gladysUsagePoint);
    } catch (e) {
      logger.warn(e);
    }
  });
};
