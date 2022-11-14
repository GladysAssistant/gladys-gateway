module.exports = function VersionController(versionModel) {
  /**
   * @api {get} /v1/api/gladys/version Return current gladys version
   * @apiName getGladysVersion
   * @apiGroup Version
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "name": "v4.0.0-alpha",
   *   "created_at": "2018-10-16 09:27:35.26586+02"
   * }
   */
  async function getCurrentVersion(req, res, next) {
    const currentVersion = await versionModel.getCurrentVersion();
    return res.json(currentVersion);
  }

  return {
    getCurrentVersion,
  };
};
