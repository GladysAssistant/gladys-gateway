const Promise = require('bluebird');

module.exports = function InstanceController(instanceModel, socketModel) {
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
    const newInstance = await instanceModel.createInstance(req.user, req.body);
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
   *   "rsa_public_key": "PUB_KEY",
   *   "ecdsa_public_key": "PUB_KEY"
   * }]
   */
  async function getInstances(req, res, next) {
    const instances = await instanceModel.getInstances(req.user);
    res.json(instances);
  }

  /**
   * @api {get} /instances/:id get instance by id
   * @apiName get instance by id
   * @apiGroup Instance
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "id": "b55b9f2f-679d-4b79-93aa-d3325f1d9e62",
   *   "name": "Raspberry Pi",
   *   "rsa_public_key": "PUB_KEY",
   *   "ecdsa_public_key": "PUB_KEY",
   *   "rsa_fingerprint": "::::",
   *   "ecdsa_fingerprint": "::::"
   * }
   */
  async function getInstanceById(req, res, next) {
    const instance = await instanceModel.getInstanceById(req.user, req.params.id);
    res.json(instance);
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
    const token = await instanceModel.getAccessToken(req.instance, req.headers.authorization);
    res.json(token);
  }

  /**
   * @api {get} /instances/users get users
   * @apiName get users
   * @apiGroup Instance
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * [{
   *    "id": "88abe47d-80fa-41e0-a7a5-381cb13786df",
   *    "rsa_public_key: "",
   *    "ecdsa_public_key": "",
   *    "connected": true
   * }]
   */
  async function getUsers(req, res, next) {
    const users = await instanceModel.getUsers(req.instance);

    const usersWithConnectedStatus = await Promise.map(users, async (userParam) => {
      const user = userParam;
      user.connected = await socketModel.isUserConnected(user.id);
      return user;
    });

    res.json(usersWithConnectedStatus);
  }

  return {
    createInstance,
    getInstances,
    getInstanceById,
    getAccessToken,
    getUsers,
  };
};
