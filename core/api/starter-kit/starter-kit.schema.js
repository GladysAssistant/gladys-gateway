const Joi = require('joi');
const { ORDERED_STATUSES, STATUS, EMAIL_TEMPLATES } = require('./starter-kit.constants');

const addressSchema = Joi.object().keys({
  line1: Joi.string().max(255).allow(null, ''),
  line2: Joi.string().max(255).allow(null, ''),
  postal_code: Joi.string().max(20).allow(null, ''),
  city: Joi.string().max(255).allow(null, ''),
  state: Joi.string().max(255).allow(null, ''),
  country: Joi.string().max(2).allow(null, ''),
});

// Pickup point as returned by the Mondial Relay widget (OnParcelShopSelected)
const pickupPointSchema = Joi.object().keys({
  id: Joi.string()
    .pattern(/^[0-9A-Za-z]{1,10}$/)
    .required(),
  name: Joi.string().max(255).required(),
  address_1: Joi.string().max(255).allow(null, ''),
  address_2: Joi.string().max(255).allow(null, ''),
  postal_code: Joi.string().max(20).allow(null, ''),
  city: Joi.string().max(255).allow(null, ''),
  country: Joi.string().max(2).default('FR'),
});

const createOrderSchema = Joi.object().keys({
  email: Joi.string().email().required(),
  customer_name: Joi.string().max(255).allow(null, ''),
  phone: Joi.string().max(50).allow(null, ''),
  language: Joi.string().valid('fr', 'en').default('fr'),
  account_id: Joi.string().uuid().allow(null),
  shipping_address: addressSchema.allow(null),
  amount_total: Joi.number().integer().min(0).allow(null),
  currency: Joi.string().length(3).allow(null),
  status: Joi.string()
    .valid(...ORDERED_STATUSES)
    .default(STATUS.PAID),
  notes: Joi.string().max(5000).allow(null, ''),
  shipment_number: Joi.string().max(50).allow(null, ''),
  pickup_point: pickupPointSchema.allow(null),
  // Set to true to send the confirmation email to the customer
  send_email: Joi.boolean().default(false),
});

const updateOrderSchema = Joi.object()
  .keys({
    customer_name: Joi.string().max(255).allow(null, ''),
    phone: Joi.string().max(50).allow(null, ''),
    language: Joi.string().valid('fr', 'en'),
    account_id: Joi.string().uuid().allow(null),
    shipping_address: addressSchema.allow(null),
    notes: Joi.string().max(5000).allow(null, ''),
    ssh_password: Joi.string().max(255),
    mini_pc_expected_at: Joi.date().iso().allow(null),
    shipment_number: Joi.string().max(50).allow(null, ''),
    label_url: Joi.string().uri().max(2000).allow(null, ''),
    pickup_point: pickupPointSchema.allow(null),
  })
  .min(1);

const changeStatusSchema = Joi.object().keys({
  status: Joi.string()
    .valid(...ORDERED_STATUSES, STATUS.CANCELLED)
    .required(),
  // Expected reception date of the mini-PC (status mini_pc_ordered)
  mini_pc_expected_at: Joi.date().iso().allow(null),
  // Tracking number if the label was created outside of the API (status shipped)
  shipment_number: Joi.string().max(50).allow(null, ''),
  // Override the default "send an email to the customer" behavior of the status
  notify: Joi.boolean(),
  note: Joi.string().max(5000).allow(null, ''),
});

const resendEmailSchema = Joi.object().keys({
  template: Joi.string()
    .valid(...EMAIL_TEMPLATES)
    .required(),
});

const listOrdersSchema = Joi.object().keys({
  status: Joi.string().valid(...ORDERED_STATUSES, STATUS.CANCELLED, 'open'),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

module.exports = {
  pickupPointSchema,
  createOrderSchema,
  updateOrderSchema,
  changeStatusSchema,
  resendEmailSchema,
  listOrdersSchema,
};
