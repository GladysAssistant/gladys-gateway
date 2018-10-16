const { NotFoundError } = require('../../common/error');

module.exports = function DeviceModel(logger, db, redisClient) {

  async function getDevices(user) {
    var devices = await db.t_device.find({
      user_id: user.id,
      is_deleted: false,
      revoked: false
    }, { fields: ['id', 'name', 'created_at']});

    return devices;
  }

  async function revokeDevice(user, deviceId) {

    var device = await db.t_device.findOne({
      user_id: user.id,
      id: deviceId,
      is_deleted: false
    });

    if(device === null) {
      throw NotFoundError();
    }

    var deviceRevoked = await db.t_device.update(deviceId, {
      revoked: true,
    }, { fields: ['id', 'revoked']});

    return deviceRevoked;
  }

  return {
    getDevices,
    revokeDevice
  };
};