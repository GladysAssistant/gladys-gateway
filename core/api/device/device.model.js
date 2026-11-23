const { NotFoundError } = require('../../common/error');
const { invalidateGoogleUsersCacheOfUser } = require('../../common/google-users-cache');

module.exports = function DeviceModel(logger, db, redisClient) {
  async function getDevices(user) {
    const devices = await db.t_device.find(
      {
        user_id: user.id,
        is_deleted: false,
        revoked: false,
      },
      { fields: ['id', 'name', 'created_at', 'last_seen'] },
    );

    return devices;
  }

  async function revokeDevice(user, deviceId) {
    const device = await db.t_device.findOne({
      user_id: user.id,
      id: deviceId,
      is_deleted: false,
    });

    if (device === null) {
      throw NotFoundError();
    }

    const deviceRevoked = await db.t_device.update(
      deviceId,
      {
        revoked: true,
      },
      { fields: ['id', 'revoked'] },
    );

    // the instances of the account stop reporting their states to Google right away
    if (device.client_id === process.env.GOOGLE_HOME_OAUTH_CLIENT_ID) {
      await invalidateGoogleUsersCacheOfUser(logger, db, redisClient, user.id);
    }

    return deviceRevoked;
  }

  return {
    getDevices,
    revokeDevice,
  };
};
