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

  /**
   * @api {get} /instances/access-token get access token
   * @apiName get access token
   * @apiGroup Instance
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   * 
   * {
   *   "access_token": "ejkjlsf"
   * }
   */
  async function getAccessToken(req, res, next) {
    var token = await instanceModel.getAccessToken(req.instance, req.headers.authorization);
    res.json(token);
  }

  return {
    createInstance,
    getInstances,
    getAccessToken
  };
};