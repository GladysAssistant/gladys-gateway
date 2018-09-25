const Joi = require('joi');

const signupSchema = Joi.object().keys({
  name: Joi.string().min(2).max(30),
  email: Joi.string().email(),
  language: Joi.string().allow(['fr', 'en']),
  srp_salt: Joi.string(),
  srp_verifier: Joi.string(),
  public_key: Joi.string(),
  encrypted_private_key: Joi.string()
});

const invitationSchema = Joi.object().keys({
  email: Joi.string().email()
});

module.exports.signupSchema = signupSchema;
module.exports.invitationSchema = invitationSchema;
  