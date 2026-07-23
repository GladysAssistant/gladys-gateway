// External webhook providers ban webhooks failing repeatedly, so past this
// delay we give up on the instance answer and return an empty 200
const EXTERNAL_INTEGRATION_WEBHOOK_TIMEOUT_MS = 10 * 1000;

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
   * @api {post} /v1/api/external-integration/:open-api-key/:selector/:webhook-key Receive external integration webhook
   * @apiName handleExternalIntegrationWebhook
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   */
  /**
   * @api {get} /v1/api/external-integration/:open-api-key/:selector/:webhook-key Receive external integration webhook
   * @apiName getExternalIntegrationWebhook
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   */
  async function handleExternalIntegrationWebhook(req, res, next) {
    // instance deleted or account without instance: answer an empty 200, never an error
    if (!req.primaryInstance) {
      return res.status(200).send();
    }

    // the body is parsed as a raw buffer on this route (see routes.js), it is
    // relayed as-is to the instance with its content-type
    const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

    const message = await openApiModel.createExternalIntegrationWebhookMessage(
      req.user,
      req.primaryInstance,
      req.params.selector,
      req.params.webhook_key,
      req.method,
      req.query,
      body,
      req.headers['content-type'],
    );

    const response = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), EXTERNAL_INTEGRATION_WEBHOOK_TIMEOUT_MS);
      socketModel
        .sendMessageOpenApi(req.user, message)
        .then((instanceResponse) => {
          clearTimeout(timeout);
          resolve(instanceResponse);
        })
        .catch(() => {
          // instance not connected: same contract as the timeout, empty 200
          clearTimeout(timeout);
          resolve(null);
        });
    });

    // the instance ack contains { status (200-499), content_type, body },
    // anything else (timeout, offline instance, invalid ack) is an empty 200
    if (!response || typeof response.status !== 'number' || response.status < 200 || response.status >= 500) {
      return res.status(200).send();
    }

    res.status(response.status);
    if (response.content_type) {
      res.set('Content-Type', response.content_type);
    }
    return res.send(response.body === undefined || response.body === null ? '' : response.body);
  }

  /**
   * @api {post} /v1/api/mcp/:open-api-key Send mcp webhook
   * @apiName sendMcpWebhook
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  /**
   * @api {get} /v1/api/mcp/:open-api-key Get mcp webhook
   * @apiName getMcpWebhook
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  /**
   * @api {delete} /v1/api/mcp/:open-api-key Delete mcp webhook
   * @apiName deleteMcpWebhook
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  async function handleMcpWebhook(req, res, next) {
    const message = await openApiModel.createMcpWebhookMessage(
      req.user,
      req.primaryInstance,
      req.method,
      req.body,
      req.headers,
    );
    const response = await socketModel.sendMessageOpenApi(req.user, message);
    res.set(response.headers);
    res.status(response.status);
    return res.json(response.body);
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

  /**
   * @api {post} /v1/api/device/state/:open-api-key Create device state Open API
   * @apiName createDeviceState
   * @apiGroup OpenAPI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "status": 200
   * }
   */
  async function createDeviceState(req, res, next) {
    const message = await openApiModel.createDeviceState(req.user, req.primaryInstance, req.body);
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
    createDeviceState,
    handleNetatmoWebhook,
    handleExternalIntegrationWebhook,
    handleMcpWebhook,
  };
};
