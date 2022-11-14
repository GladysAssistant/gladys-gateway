const Joi = require('joi');

const signupSchema = Joi.object().keys({
  name: Joi.string().min(2).max(30),
  email: Joi.string().email(),
  language: Joi.string().allow(['fr', 'en']),
  gladys_user_id: Joi.number().optional().allow(null),
  gladys_4_user_id: Joi.string().optional().allow(null),
  srp_salt: Joi.string(),
  srp_verifier: Joi.string(),
  rsa_public_key: Joi.string(),
  rsa_encrypted_private_key: Joi.string(),
  ecdsa_public_key: Joi.string(),
  ecdsa_encrypted_private_key: Joi.string(),
  encrypted_backup_key: Joi.string().optional(),
});

const invitationSchema = Joi.object().keys({
  email: Joi.string().email(),
  role: Joi.string(),
});

const resetPasswordSchema = Joi.object().keys({
  srp_salt: Joi.string(),
  srp_verifier: Joi.string(),
  rsa_public_key: Joi.string(),
  rsa_encrypted_private_key: Joi.string(),
  ecdsa_public_key: Joi.string(),
  ecdsa_encrypted_private_key: Joi.string(),
});

const openApiSchema = Joi.object().keys({
  name: Joi.string().required(),
});

const enedisApiQuerySchema = Joi.object().keys({
  usage_point_id: Joi.string().required(),
  start: Joi.string().required(),
  end: Joi.string().required(),
});

module.exports.signupSchema = signupSchema;
module.exports.invitationSchema = invitationSchema;
module.exports.resetPasswordSchema = resetPasswordSchema;
module.exports.openApiSchema = openApiSchema;
module.exports.enedisApiQuerySchema = enedisApiQuerySchema;
