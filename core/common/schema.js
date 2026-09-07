const Joi = require('joi');

// Delay of the instance watchdog: short enough to be useful, long enough not to be woken
// up by an internet box rebooting; a week at most.
const INSTANCE_OFFLINE_ALERT_MIN_DELAY_IN_MINUTES = 5;
const INSTANCE_OFFLINE_ALERT_MAX_DELAY_IN_MINUTES = 7 * 24 * 60;

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
  // Instance watchdog: email the user when his Gladys has been unreachable for this long
  instance_offline_alert_enabled: Joi.boolean(),
  instance_offline_alert_delay_in_minutes: Joi.number()
    .integer()
    .min(INSTANCE_OFFLINE_ALERT_MIN_DELAY_IN_MINUTES)
    .max(INSTANCE_OFFLINE_ALERT_MAX_DELAY_IN_MINUTES),
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
module.exports.INSTANCE_OFFLINE_ALERT_MIN_DELAY_IN_MINUTES = INSTANCE_OFFLINE_ALERT_MIN_DELAY_IN_MINUTES;
module.exports.INSTANCE_OFFLINE_ALERT_MAX_DELAY_IN_MINUTES = INSTANCE_OFFLINE_ALERT_MAX_DELAY_IN_MINUTES;

// Admin API (see core/api/admin/admin-api.controller.js)
const adminListAccountsQuerySchema = Joi.object().keys({
  search: Joi.string().trim().max(255).allow('').optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

// Jobs of the admin API (Stripe reconciliation, retention policy) are read-only by default
const adminLifecycleJobSchema = Joi.object().keys({
  execute: Joi.boolean().default(false),
});

const adminUpdateAccountSchema = Joi.object()
  .keys({
    is_internal: Joi.boolean(),
  })
  .min(1);

// Gladys versions are named like the git tags of the Gladys repository: v4.57.0, v4.0.0-alpha
const gladysVersionNamePattern = /^v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const adminCreateGladysVersionSchema = Joi.object().keys({
  name: Joi.string().trim().pattern(gladysVersionNamePattern).max(255).required(),
  default_release_note_link: Joi.string()
    .uri({ scheme: ['https'] })
    .max(2048)
    .allow(null)
    .optional(),
  fr_release_note_link: Joi.string()
    .uri({ scheme: ['https'] })
    .max(2048)
    .allow(null)
    .optional(),
  active: Joi.boolean().default(true),
});

const adminUpdateGladysVersionSchema = Joi.object()
  .keys({
    default_release_note_link: Joi.string()
      .uri({ scheme: ['https'] })
      .max(2048)
      .allow(null),
    fr_release_note_link: Joi.string()
      .uri({ scheme: ['https'] })
      .max(2048)
      .allow(null),
    active: Joi.boolean(),
  })
  .min(1);

module.exports.adminListAccountsQuerySchema = adminListAccountsQuerySchema;
module.exports.adminLifecycleJobSchema = adminLifecycleJobSchema;
module.exports.adminUpdateAccountSchema = adminUpdateAccountSchema;
module.exports.adminCreateGladysVersionSchema = adminCreateGladysVersionSchema;
module.exports.adminUpdateGladysVersionSchema = adminUpdateGladysVersionSchema;
