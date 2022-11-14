module.exports = function DeviceController(deviceModel) {
  /**
   * @api {get} /users/me/devices Get connected devices
   * @apiName Get connected devices
   * @apiGroup Device
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * [{
   *   "id": "272eff3c-2069-4734-84f3-8e42086475f5",
   *   "name": "Firefox Tony Stark"
   * }]
   */
  async function getDevices(req, res, next) {
    const devices = await deviceModel.getDevices(req.user);
    res.json(devices);
  }

  /**
   * @api {post} /devices/:id/revoke Revoke device
   * @apiName Revoke device
   * @apiGroup Device
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "id": "272eff3c-2069-4734-84f3-8e42086475f5",
   *   "revoked": true
   * }
   */
  async function revokeDevice(req, res, next) {
    const device = await deviceModel.revokeDevice(req.user, req.params.id);
    res.json(device);
  }

  return {
    getDevices,
    revokeDevice,
  };
};
