module.exports = function OpenApiController(openApiModel, socketModel) {
  /**
   * @api {post} /open-api-keys Create new open API key
   * @apiName createApiKey
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "api_key": "xxxxx"
   * }
   */
  async function createNewApiKey(req, res, next) {
    const newApiKey = await openApiModel.createNewApiKey(req.user, req.body.name);
    return res.json(newApiKey);
  }

  /**
   * @api {get} /open-api-keys Get open API key
   * @apiName getApiKey
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * [{
   *   "id": "xxxxx",
   *   "name": "Open Api Key",
   *   "last_used": ""
   * }]
   */
  async function getApiKeys(req, res, next) {
    const keys = await openApiModel.getApiKeys(req.user);
    return res.json(keys);
  }

  /**
   * @api {delete} /open-api-keys/:id Revoke open API key
   * @apiName revokeApiKey
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "success": true
   * }
   */
  async function revokeApiKey(req, res, next) {
    await openApiModel.revokeApiKey(req.params.id);
    return res.json({ success: true });
  }

  /**
   * @api {patch} /open-api-keys/:id Update open API key
   * @apiName updateApiKey
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "name": "new name"
   * }
   */
  async function updateApiKeyName(req, res, next) {
    const newApiKey = await openApiModel.updateApiKeyName(req.params.id, req.body.name);
    return res.json(newApiKey);
  }

  /**
   * @api {post} /v1/api/event/:open-api-key Create event Open API
   * @apiName createEvent
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  async function createEvent(req, res, next) {
    const message = await openApiModel.createEvent(req.user, req.primaryInstance, req.body);
    const newEvent = await socketModel.sendMessageOpenApi(req.user, message);
    if (newEvent.status && newEvent.status >= 400) {
      res.status(newEvent.status);
    }
    return res.json(newEvent);
  }

  /**
   * @api {post} /v1/api/owntracks/:open-api-key Create owntracks location Open API
   * @apiName createOwntracksLocation
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  async function createOwntracksLocation(req, res, next) {
    const message = await openApiModel.createOwntrackLocation(req.user, req.primaryInstance, req.headers, req.body);
    await socketModel.sendMessageOpenApi(req.user, message);
    return res.json({
      status: 200,
    });
  }

  /**
   * @api {post} /v1/api/netatmo/:open-api-key Receive netatmo webhook
   * @apiName handleNetatmoWebhook
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  async function handleNetatmoWebhook(req, res, next) {
    const message = await openApiModel.createNetatmoWebhookMessage(req.user, req.primaryInstance, req.body);
    await socketModel.sendMessageOpenApi(req.user, message);
    return res.json({
      status: 200,
    });
  }

  /**
   * @api {post} /v1/api/message/:open-api-key Create message Open API
   * @apiName createMessage
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  async function createMessage(req, res, next) {
    const message = await openApiModel.createMessage(req.user, req.primaryInstance, req.body.text);
    const response = await socketModel.sendMessageOpenApi(req.user, message);
    if (response.status && response.status >= 400) {
      return res.status(response.status).json(response);
    }
    return res.json({ status: 200 });
  }

  return {
    createNewApiKey,
    getApiKeys,
    revokeApiKey,
    updateApiKeyName,
    createEvent,
    createOwntracksLocation,
    createMessage,
    handleNetatmoWebhook,
  };
};
