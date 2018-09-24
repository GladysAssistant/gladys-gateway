const Joi = require('joi');
const uuid = require('uuid');
const crypto = require('crypto');
const { ValidationError } = require('../../common/error');

module.exports = function InstanceModel(logger, db, redisClient, jwtService) {

  const instanceSchema = Joi.object().keys({
    name: Joi.string().min(2).max(30).required(),
    public_key: Joi.string().required()
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
    value.refresh_token_hash = crypto.createHash('sha256').update(refreshToken).digest('base64');

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
    }, { fields: ['id', 'name', 'public_key']});

    return instances;
  }

  return {
    createInstance,
    getInstances
  };
};