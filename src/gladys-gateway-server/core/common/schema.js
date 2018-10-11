const Joi = require('joi');

const signupSchema = Joi.object().keys({
  name: Joi.string().min(2).max(30),
  email: Joi.string().email(),
  language: Joi.string().allow(['fr', 'en']),
  gladys_user_id: Joi.number().optional(),
  srp_salt: Joi.string(),
  srp_verifier: Joi.string(),
  rsa_public_key: Joi.string(),
  rsa_encrypted_private_key: Joi.string(),
  ecdsa_public_key: Joi.string(),
  ecdsa_encrypted_private_key: Joi.string()
});

const invitationSchema = Joi.object().keys({
  email: Joi.string().email()
});

const resetPasswordSchema = Joi.object().keys({
  srp_salt: Joi.string(),
  srp_verifier: Joi.string(),
  rsa_public_key: Joi.string(),
  rsa_encrypted_private_key: Joi.string(),
  ecdsa_public_key: Joi.string(),
  ecdsa_encrypted_private_key: Joi.string()
});

module.exports.signupSchema = signupSchema;
module.exports.invitationSchema = invitationSchema;
module.exports.resetPasswordSchema = resetPasswordSchema;
  