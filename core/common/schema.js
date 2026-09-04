const Joi = require('joi');

const signupSchema = Joi.object().keys({
  name: Joi.string().min(2).max(30),
  email: Joi.string().email(),
  language: Joi.string().valid('fr', 'en'),
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

// Fields a logged-in user can change on his profile. The SRP verifier, the encrypted
// private keys and the backup key are deliberately excluded: changing them is a password
// change, which must go through the reset-password flow (email token + two factor).
const updateUserSchema = Joi.object().keys({
  name: Joi.string().min(2).max(30),
  email: Joi.string().email(),
  language: Joi.string().valid('fr', 'en'),
  gladys_user_id: Joi.number().optional().allow(null),
  gladys_4_user_id: Joi.string().optional().allow(null),
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
  after: Joi.string().required(),
  take: Joi.number().integer().required(),
});

module.exports.signupSchema = signupSchema;
module.exports.updateUserSchema = updateUserSchema;
module.exports.invitationSchema = invitationSchema;
module.exports.resetPasswordSchema = resetPasswordSchema;
module.exports.openApiSchema = openApiSchema;
module.exports.enedisApiQuerySchema = enedisApiQuerySchema;
