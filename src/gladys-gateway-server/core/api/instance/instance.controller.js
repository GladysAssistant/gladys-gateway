module.exports = function(instanceModel) {

  /**
   * @api {post} /instances create new instance
   * @apiName create new instance
   * @apiGroup Instance
   * 
   * @apiParam {String} name name of the instance
   * @apiParam {String} name name of the instance
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   * 
   * {
   *   "id": "b55b9f2f-679d-4b79-93aa-d3325f1d9e62",
   *   "name": "Raspberry Pi",
   *   "refresh_token": "",
   *   "access_token": ""
   * }
   */
  async function createInstance(req, res, next) {
    var newInstance = await instanceModel.createInstance(req.user, req.body);
    res.status(201).json(newInstance);
  }

  /**
   * @api {get} /instances get instances
   * @apiName get instances
   * @apiGroup Instance
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   * 
   * [{
   *   "id": "b55b9f2f-679d-4b79-93aa-d3325f1d9e62",
   *   "name": "Raspberry Pi",
   *   "public_key": "PUB_KEY"
   * }]
   */
  async function getInstances(req, res, next) {
    var instances = await instanceModel.getInstances(req.user);
    res.json(instances);
  }

  return {
    createInstance,
    getInstances
  };
};