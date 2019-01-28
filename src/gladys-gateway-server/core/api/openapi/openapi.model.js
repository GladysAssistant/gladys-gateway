const Promise = require('bluebird');
const crypto = require('crypto');
const randomBytes = Promise.promisify(crypto.randomBytes);

module.exports = function OpenApiModel(logger, db) {

  async function createNewApiKey(user) {
    const apiKey = (await randomBytes(40)).toString('hex');
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const newApiKey = {
      name: 'Open API Key',
      api_key_hash: apiKeyHash,
      user_id: user.id
    };

    await db.t_open_api_key.insert(newApiKey);

    return {
      api_key: apiKey
    };
  }

  async function getApiKeys(user) {
    const keys = await db.t_open_api_key.find({
      user_id: user.id,
      is_deleted: false,
      revoked: false
    }, { fields: ['id', 'name', 'created_at', 'last_used']});

    return keys;
  }

  async function revokeApiKey(id) {
    await db.t_open_api_key.update({
      id
    }, { revoked: true });
  }

  async function updateApiKeyName(id, name) {
    await db.t_open_api_key.update({
      id
    }, { name });

    return { name };
  }

  async function findOpenApiKey(apiKey) {
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    return db.t_open_api_key.findOne({
      api_key_hash: apiKeyHash,
      is_deleted: false,
      revoked: false
    }, { fields: ['id', 'name', 'user_id', 'created_at', 'last_used']});
  }

  async function updateLastUsed(id) {
    await db.t_open_api_key.update({
      id
    }, { last_used: new Date()});
  }

  async function createEvent(user, event) {

    // add gladys_user_id to event
    event.user = user.gladys_user_id;
    
    const message = {
      version: '1.0',
      type: 'gladys-open-api',
      action: 'create-event',
      data: event
    };

    return message;
  }

  async function createMessage(user, text) {
    
    const message = {
      version: '1.0',
      type: 'gladys-open-api',
      action: 'create-message',
      data: {
        text,
        user: user.gladys_user_id
      }
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
    createMessage
  };
};