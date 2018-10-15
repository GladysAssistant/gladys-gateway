const Joi = require('joi');
const uuid = require('uuid');
const crypto = require('crypto');
const { ValidationError, ForbiddenError, NotFoundError } = require('../../common/error');

module.exports = function InstanceModel(logger, db, redisClient, jwtService, fingerprint) {

  const instanceSchema = Joi.object().keys({
    name: Joi.string().min(2).max(30).required(),
    rsa_public_key: Joi.string().required(),
    ecdsa_public_key: Joi.string().required(),
  });

  async function createInstance(user, newInstance) {

    const { error, value } = Joi.validate(newInstance, instanceSchema, {stripUnknown: true, abortEarly: false});

    if (error) {
      logger.debug(error);
      throw new ValidationError('instance', error);
    }

    // get the account id of the user
    var userWithAccount = await db.t_user.findOne({
      id: user.id
    }, { fields: ['id', 'account_id']});
    
    value.id = uuid.v4();
    value.account_id = userWithAccount.account_id;

    // we generate access token and refresh token 
    // and save the hash of the refresh token in the instance table
    // so we can invalidate it later
    var refreshToken = jwtService.generateRefreshTokenInstance(value);
    var accessToken = jwtService.generateAccessTokenInstance(value);
    value.refresh_token_hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    value.primary_instance = true;

    // set all other instances in account as secondary instance
    await db.t_instance.update({
      account_id: userWithAccount.account_id
    }, {
      primary_instance: false
    });

    var insertedInstance = await db.t_instance.insert(value);
    
    return {
      id: insertedInstance.id,
      name: insertedInstance.name,
      refresh_token: refreshToken,
      access_token: accessToken
    };
  }

  async function getInstances(user) {

    // get the account id of the user
    var userWithAccount = await db.t_user.findOne({
      id: user.id
    }, { fields: ['id', 'account_id']});

    // get all instances in this account
    var instances = await db.t_instance.find({
      account_id: userWithAccount.account_id,
      is_deleted: false
    }, { fields: ['id', 'name', 'primary_instance', 'rsa_public_key', 'ecdsa_public_key']});

    return instances;
  }

  async function getInstanceById(user, instanceId) {

    // get the account id of the user
    var userWithAccount = await db.t_user.findOne({
      id: user.id
    }, { fields: ['id', 'account_id']});

    // get instance
    var instance = await db.t_instance.findOne({
      account_id: userWithAccount.account_id,
      id: instanceId,
      is_deleted: false
    }, { fields: ['id', 'name', 'primary_instance', 'rsa_public_key', 'ecdsa_public_key']});

    if(instance === null){
      throw new NotFoundError('Instance not found');
    }

    instance.rsa_fingerprint = fingerprint.generate(instance.rsa_public_key);
    instance.ecdsa_fingerprint = fingerprint.generate(instance.ecdsa_public_key);

    return instance;
  }

  async function getAccessToken(instance, refreshToken) {
    var refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // we are looking for instance not deleted with 
    // this refresh_token_hash
    var instance = await db.t_instance.findOne({
      id: instance.id,
      refresh_token_hash: refreshTokenHash,
      is_deleted: false
    });

    // the instance doesn't exist or has been deleted
    if(instance === null) {
      throw new ForbiddenError();
    }

    var accessToken = jwtService.generateAccessTokenInstance(instance);

    return {
      access_token: accessToken
    };
  }

  async function getUsers(instance) {
    
    var users = await db.query(`
      SELECT t_user.id, t_user.rsa_public_key, t_user.ecdsa_public_key
      FROM t_user
      JOIN t_instance ON t_instance.account_id = t_user.account_id
      WHERE t_user.is_deleted = false
      AND t_user.email_confirmed = true
      AND t_instance.id = $1
    `, [instance.id]);

    var redisMultiRequest = redisClient.multi();
    
    users.forEach((user) => {
      redisMultiRequest.getAsync('connected_user:' + user.id);
    });

    var connectedUsers = await redisMultiRequest.execAsync();

    users.forEach((user, index) => {
      user.connected = ( connectedUsers[index] !== null );
    });

    return users;
  }

  return {
    createInstance,
    getInstances,
    getInstanceById,
    getAccessToken,
    getUsers
  };
};