// Life cycle of a starter kit order. Statuses are ordered: an order can only move
// forward (skipping steps is allowed, e.g. when a mini-PC is already in stock).
const STATUS = {
  PAID: 'paid',
  MINI_PC_ORDERED: 'mini_pc_ordered',
  MINI_PC_RECEIVED: 'mini_pc_received',
  INSTALLED: 'installed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

const ORDERED_STATUSES = [
  STATUS.PAID,
  STATUS.MINI_PC_ORDERED,
  STATUS.MINI_PC_RECEIVED,
  STATUS.INSTALLED,
  STATUS.SHIPPED,
  STATUS.DELIVERED,
];

const TERMINAL_STATUSES = [STATUS.DELIVERED, STATUS.CANCELLED];

// Column storing the date of each status change
const STATUS_DATE_COLUMN = {
  [STATUS.PAID]: 'paid_at',
  [STATUS.MINI_PC_ORDERED]: 'mini_pc_ordered_at',
  [STATUS.MINI_PC_RECEIVED]: 'mini_pc_received_at',
  [STATUS.INSTALLED]: 'installed_at',
  [STATUS.SHIPPED]: 'shipped_at',
  [STATUS.DELIVERED]: 'delivered_at',
  [STATUS.CANCELLED]: 'cancelled_at',
};

// Email sent to the customer when the order reaches a status (null = no email).
// mini_pc_received is an internal step: the customer is only told when the kit is installed.
const STATUS_EMAIL_TEMPLATE = {
  [STATUS.PAID]: 'starter_kit_order_confirmed',
  [STATUS.MINI_PC_ORDERED]: 'starter_kit_status_update',
  [STATUS.MINI_PC_RECEIVED]: null,
  [STATUS.INSTALLED]: 'starter_kit_status_update',
  [STATUS.SHIPPED]: 'starter_kit_shipped',
  [STATUS.DELIVERED]: 'starter_kit_delivered',
  [STATUS.CANCELLED]: null,
};

const EMAIL_TEMPLATES = [
  'starter_kit_order_confirmed',
  'starter_kit_pickup_point_reminder',
  'starter_kit_status_update',
  'starter_kit_shipped',
  'starter_kit_delivered',
];

const EVENT_TYPE = {
  STATUS_CHANGED: 'status_changed',
  EMAIL_SENT: 'email_sent',
  PICKUP_POINT_SELECTED: 'pickup_point_selected',
  LABEL_CREATED: 'label_created',
  NOTE: 'note',
};

const DEFAULT_PICKUP_POINT_REMINDER_DAYS = 3;
const DEFAULT_SSH_USERNAME = 'gladys';

module.exports = {
  STATUS,
  ORDERED_STATUSES,
  TERMINAL_STATUSES,
  STATUS_DATE_COLUMN,
  STATUS_EMAIL_TEMPLATE,
  EMAIL_TEMPLATES,
  EVENT_TYPE,
  DEFAULT_PICKUP_POINT_REMINDER_DAYS,
  DEFAULT_SSH_USERNAME,
};
