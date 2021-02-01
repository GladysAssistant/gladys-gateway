const Promise = require('bluebird');
const crypto = require('crypto');
const Joi = require('joi');
const { ValidationError } = require('../../common/error');
const schemas = require('../../common/schema');

const randomBytes = Promise.promisify(crypto.randomBytes);

module.exports = function OpenApiModel(logger, db) {
  async function createNewApiKey(user, name) {
    const { error } = Joi.validate({ name }, schemas.openApiSchema, {
      stripUnknown: true,
      abortEarly: false,
      presence: 'required',
    });

    if (error) {
      logger.debug(error);
      throw new ValidationError('open-api-key', error);
    }

    const apiKey = (await randomBytes(40)).toString('hex');
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const newApiKey = {
      name,
      api_key_hash: apiKeyHash,
      user_id: user.id,
    };

    const insertedApiKey = await db.t_open_api_key.insert(newApiKey);
    insertedApiKey.api_key = apiKey;

    return insertedApiKey;
  }

  async function getApiKeys(user) {
    const keys = await db.t_open_api_key.find(
      {
        user_id: user.id,
        is_deleted: false,
        revoked: false,
      },
      { fields: ['id', 'name', 'created_at', 'last_used'] },
    );

    return keys;
  }

  async function revokeApiKey(id) {
    await db.t_open_api_key.update(
      {
        id,
      },
      { revoked: true },
    );
  }

  async function updateApiKeyName(id, name) {
    await db.t_open_api_key.update(
      {
        id,
      },
      { name },
    );

    return { name };
  }

  async function findOpenApiKey(apiKey) {
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    return db.t_open_api_key.findOne(
      {
        api_key_hash: apiKeyHash,
        is_deleted: false,
        revoked: false,
      },
      { fields: ['id', 'name', 'user_id', 'created_at', 'last_used'] },
    );
  }

  async function updateLastUsed(id) {
    await db.t_open_api_key.update(
      {
        id,
      },
      { last_used: new Date() },
    );
  }

  async function createEvent(user, primaryInstance, eventParam) {
    const event = eventParam;
    // add gladys_user_id to event
    event.user = user.gladys_user_id;

    const message = {
      version: '1.0',
      type: 'gladys-open-api',
      action: 'create-event',
      instance_id: primaryInstance.id,
      data: event,
    };

    return message;
  }

  async function createOwntrackLocation(user, primaryInstance, headers, body) {
    const location = {
      user_id: user.gladys_4_user_id,
      latitude: body.lat,
      longitude: body.lon,
      accuracy: body.acc,
      altitude: body.alt,
      device_battery: body.batt,
      device_selector: headers['x-limit-d'],
    };

    const message = {
      version: '1.0',
      type: 'gladys-open-api',
      action: 'create-owntracks-location',
      instance_id: primaryInstance.id,
      data: location,
    };

    return message;
  }

  async function createNetatmoWebhookMessage(user, primaryInstance, body) {
    const data = {
      user_id: user.gladys_4_user_id,
      netatmo_data: body,
    };

    const message = {
      version: '1.0',
      type: 'gladys-open-api',
      action: 'netatmo-webhook',
      instance_id: primaryInstance.id,
      data,
    };

    return message;
  }

  async function createMessage(user, primaryInstance, text) {
    const message = {
      version: '1.0',
      type: 'gladys-open-api',
      action: 'create-message',
      instance_id: primaryInstance.id,
      data: {
        text,
        user: user.gladys_user_id,
      },
    };

    return message;
  }

  return {
    createNewApiKey,
    getApiKeys,
    revokeApiKey,
    updateApiKeyName,
    findOpenApiKey,
    updateLastUsed,
    createEvent,
    createOwntrackLocation,
    createNetatmoWebhookMessage,
    createMessage,
  };
};
