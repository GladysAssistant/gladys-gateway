const Promise = require('bluebird');
const crypto = require('crypto');
const {
  BadGatewayError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../common/error');
const { extractFirstname } = require('../../common/billing-email-scope');
const { normalizeEmail } = require('../../common/normalize-email');
const { normalizeLanguage } = require('../../common/language');
const schema = require('./starter-kit.schema');
const {
  STATUS,
  ORDERED_STATUSES,
  TERMINAL_STATUSES,
  STATUS_DATE_COLUMN,
  STATUS_EMAIL_TEMPLATE,
  EVENT_TYPE,
  DEFAULT_PICKUP_POINT_REMINDER_DAYS,
  DEFAULT_SSH_USERNAME,
} = require('./starter-kit.constants');

const randomBytes = Promise.promisify(crypto.randomBytes);
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

// Characters used for the generated SSH password: no ambiguous characters (0/O, 1/l/I)
// so the password can be typed from the email without mistakes.
const PASSWORD_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASSWORD_LENGTH = 16;

const STATUS_LABELS = {
  fr: {
    [STATUS.PAID]: 'Commande confirmée',
    [STATUS.MINI_PC_ORDERED]: 'Mini-PC commandé',
    [STATUS.MINI_PC_RECEIVED]: 'Mini-PC reçu, installation en cours',
    [STATUS.INSTALLED]: 'Gladys installée, prêt à expédier',
    [STATUS.SHIPPED]: 'Colis expédié',
    [STATUS.DELIVERED]: 'Colis livré',
    [STATUS.CANCELLED]: 'Commande annulée',
  },
  en: {
    [STATUS.PAID]: 'Order confirmed',
    [STATUS.MINI_PC_ORDERED]: 'Mini-PC ordered',
    [STATUS.MINI_PC_RECEIVED]: 'Mini-PC received, installation in progress',
    [STATUS.INSTALLED]: 'Gladys installed, ready to ship',
    [STATUS.SHIPPED]: 'Parcel shipped',
    [STATUS.DELIVERED]: 'Parcel delivered',
    [STATUS.CANCELLED]: 'Order cancelled',
  },
};

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// The customer tracking token is derived from the order id with a server secret: it is
// stable across emails (the tracking link never changes) and only its hash is stored, so a
// read-only database leak does not give access to the tracking pages.
function computeTrackingToken(orderId) {
  const secret = process.env.STARTER_KIT_TRACKING_SECRET;
  if (!secret) {
    // Fail closed: silently using another secret would change every tracking link
    // sent by email as soon as that other secret is rotated.
    throw new Error('STARTER_KIT_TRACKING_SECRET is not defined');
  }
  return crypto.createHmac('sha256', secret).update(orderId).digest('hex');
}

function formatDate(date, language) {
  if (!date) {
    return '';
  }
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(new Date(date));
}

function getStatusLabel(status, language) {
  const labels = STATUS_LABELS[language] || STATUS_LABELS.fr;
  return labels[status] || status;
}

// Public URL of the customer tracking page. `{language}` and `{token}` placeholders are
// replaced, and the token is appended as a query parameter when the URL has no placeholder.
function getTrackingUrl(token, language) {
  const base = process.env.STARTER_KIT_TRACKING_URL;
  if (!base) {
    return null;
  }
  let url = base.replace('{language}', language);
  if (url.includes('{token}')) {
    return url.replace('{token}', encodeURIComponent(token));
  }
  url += url.includes('?') ? '&' : '?';
  return `${url}token=${encodeURIComponent(token)}`;
}

function getStatusHistory(order) {
  return ORDERED_STATUSES.concat(STATUS.CANCELLED)
    .map((status) => ({ status, at: order[STATUS_DATE_COLUMN[status]] }))
    .filter((item) => item.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

function validate(joiSchema, data, objectName) {
  const { error, value } = joiSchema.validate(data, {
    stripUnknown: true,
    abortEarly: false,
  });
  if (error) {
    throw new ValidationError(objectName, error);
  }
  return value;
}

// Address collected by Stripe Checkout. Depending on the Stripe API version, the shipping
// address is either in `shipping_details`, `collected_information.shipping_details` or
// only in `customer_details` (billing address).
function extractStripeAddress(session) {
  const shipping = session.collected_information?.shipping_details || session.shipping_details || null;
  const address = shipping?.address || session.customer_details?.address || null;
  if (!address) {
    return null;
  }
  return {
    name: shipping?.name || session.customer_details?.name || null,
    line1: address.line1 || null,
    line2: address.line2 || null,
    postal_code: address.postal_code || null,
    city: address.city || null,
    state: address.state || null,
    country: address.country || null,
  };
}

module.exports = function StarterKitModel(
  logger,
  db,
  stripeService,
  mailService,
  telegramService,
  mondialRelayService,
) {
  async function generateSshPassword() {
    const bytes = await randomBytes(PASSWORD_LENGTH);
    return Array.from(bytes)
      .map((byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length])
      .join('');
  }

  async function addEvent(orderId, type, payload = {}) {
    return db.t_starter_kit_order_event.insert({ order_id: orderId, type, payload });
  }

  async function getOrderOrFail(id) {
    const order = await db.t_starter_kit_order.findOne({ id, is_deleted: false });
    if (!order) {
      throw new NotFoundError('Starter kit order not found');
    }
    return order;
  }

  function getShipmentTrackingUrl(order) {
    if (!order.shipment_number) {
      return null;
    }
    const postalCode = order.pickup_point?.postal_code || order.shipping_address?.postal_code || null;
    return mondialRelayService.getPublicTrackingUrl(order.shipment_number, postalCode);
  }

  // Scope shared by all starter kit emails
  function buildEmailScope(order, trackingToken, extra = {}) {
    const { language } = order;
    return {
      language,
      firstname: extractFirstname(order.customer_name),
      status: order.status,
      statusLabel: getStatusLabel(order.status, language),
      trackingUrl: trackingToken ? getTrackingUrl(trackingToken, language) : null,
      trainingUrl: process.env.STARTER_KIT_TRAINING_URL || null,
      trainingCode: process.env.STARTER_KIT_TRAINING_CODE || null,
      gladysPlusUrl: process.env.GLADYS_PLUS_FRONTEND_URL || null,
      installGuideUrl: process.env.STARTER_KIT_INSTALL_GUIDE_URL || null,
      pickupPoint: order.pickup_point || null,
      pickupPointSelected: Boolean(order.pickup_point),
      shipmentNumber: order.shipment_number || null,
      shipmentTrackingUrl: getShipmentTrackingUrl(order),
      miniPcExpectedAt: order.mini_pc_expected_at ? formatDate(order.mini_pc_expected_at, language) : null,
      sshUsername: process.env.STARTER_KIT_SSH_USERNAME || DEFAULT_SSH_USERNAME,
      sshPassword: order.ssh_password || null,
      ...extra,
    };
  }

  // Returns the tracking token of the order, and stores its hash if it changed
  // (secret rotation, or order imported with another token).
  async function getTrackingToken(order) {
    const token = computeTrackingToken(order.id);
    const hash = hashToken(token);
    if (order.tracking_token_hash !== hash) {
      await db.t_starter_kit_order.update(order.id, { tracking_token_hash: hash, updated_at: new Date() });
    }
    return token;
  }

  async function sendEmail(order, template, extraScope = {}) {
    const token = await getTrackingToken(order);
    const scope = buildEmailScope(order, token, extraScope);
    await mailService.send({ email: order.email, language: order.language }, template, scope);
    await addEvent(order.id, EVENT_TYPE.EMAIL_SENT, { template });
  }

  async function isStarterKitCheckoutSession(session) {
    const metadata = session.metadata || {};
    if (metadata.starter_kit === 'true' || metadata.product === 'starter_kit') {
      return true;
    }
    const productId = process.env.STRIPE_STARTER_KIT_PRODUCT_ID;
    if (!productId || !session.id) {
      return false;
    }
    const lineItems = await stripeService.getCheckoutSessionLineItems(session.id);
    return lineItems.some((item) => {
      const product = item.price?.product;
      const id = typeof product === 'string' ? product : product?.id;
      return id === productId;
    });
  }

  async function notifyAdmin(text) {
    try {
      await telegramService.sendAlert(text);
    } catch (e) {
      logger.warn(e);
    }
  }

  async function insertOrder(data, { sendConfirmationEmail }) {
    const id = crypto.randomUUID();
    const sshPassword = await generateSshPassword();
    const status = data.status || STATUS.PAID;
    const now = new Date();
    const toInsert = {
      ...data,
      id,
      email: normalizeEmail(data.email),
      status,
      tracking_token_hash: hashToken(computeTrackingToken(id)),
      ssh_password: sshPassword,
      paid_at: now,
      [STATUS_DATE_COLUMN[status]]: now,
      created_at: now,
      updated_at: now,
    };
    const order = await db.t_starter_kit_order.insert(toInsert);
    await addEvent(order.id, EVENT_TYPE.STATUS_CHANGED, { from: null, to: status });
    if (sendConfirmationEmail) {
      try {
        await sendEmail(order, STATUS_EMAIL_TEMPLATE[STATUS.PAID]);
      } catch (e) {
        logger.warn(`Starter kit: unable to send confirmation email for order ${order.id}`);
        logger.warn(e);
        await notifyAdmin(`⚠️ Starter kit: confirmation email could not be sent to ${order.email} (order ${order.id})`);
      }
    }
    return order;
  }

  /**
   * Create an order from a Stripe `checkout.session.completed` event. Idempotent: Stripe
   * retries webhooks, so an order is created at most once per checkout session.
   */
  async function createOrderFromStripeSession(session, account = null) {
    const existingOrder = await db.t_starter_kit_order.findOne({ stripe_checkout_session_id: session.id });
    if (existingOrder) {
      logger.info(`Starter kit: order ${existingOrder.id} already exists for session ${session.id}, skipping`);
      return existingOrder;
    }
    const customerDetails = session.customer_details || {};
    const email = normalizeEmail(customerDetails.email || session.customer_email || account?.name);
    if (!email) {
      throw new BadRequestError('Starter kit checkout session has no customer email');
    }
    const language = normalizeLanguage(session.locale, 'fr');
    const shippingAddress = extractStripeAddress(session);
    const order = await insertOrder(
      {
        account_id: account ? account.id : null,
        email,
        customer_name: shippingAddress?.name || customerDetails.name || null,
        phone: customerDetails.phone || null,
        language,
        stripe_checkout_session_id: session.id,
        stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
        stripe_payment_intent_id:
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
        amount_total: session.amount_total ?? null,
        currency: session.currency || null,
        shipping_address: shippingAddress,
      },
      { sendConfirmationEmail: true },
    );
    logger.info(`Starter kit: order ${order.id} created for ${email}`);
    const amazonUrl = process.env.STARTER_KIT_MINI_PC_SHOP_URL;
    await notifyAdmin(
      `🎁 New starter kit order from ${email} (${language})! Order ${order.id}.` +
        `${amazonUrl ? ` Order the mini-PC: ${amazonUrl}` : ''}`,
    );
    return order;
  }

  // View of an order exposed to the customer through the tracking token: no address,
  // no Stripe ids, no admin notes.
  function toPublicOrder(order) {
    const shippedOrDelivered = [STATUS.SHIPPED, STATUS.DELIVERED].includes(order.status);
    return {
      id: order.id,
      status: order.status,
      status_label: getStatusLabel(order.status, order.language),
      status_history: getStatusHistory(order).map((item) => ({
        ...item,
        label: getStatusLabel(item.status, order.language),
      })),
      language: order.language,
      customer_first_name: extractFirstname(order.customer_name),
      created_at: order.created_at,
      mini_pc_expected_at: order.mini_pc_expected_at,
      pickup_point: order.pickup_point,
      pickup_point_selected_at: order.pickup_point_selected_at,
      can_select_pickup_point: !order.shipment_number && !TERMINAL_STATUSES.includes(order.status),
      shipment_number: order.shipment_number,
      shipment_tracking_url: getShipmentTrackingUrl(order),
      training: {
        url: process.env.STARTER_KIT_TRAINING_URL || null,
        code: process.env.STARTER_KIT_TRAINING_CODE || null,
      },
      install_guide_url: process.env.STARTER_KIT_INSTALL_GUIDE_URL || null,
      ssh: shippedOrDelivered
        ? { username: process.env.STARTER_KIT_SSH_USERNAME || DEFAULT_SSH_USERNAME, password: order.ssh_password }
        : null,
      mondial_relay: {
        widget_brand_code: mondialRelayService.getWidgetBrandCode(),
        country: order.shipping_address?.country || 'FR',
        postal_code: order.shipping_address?.postal_code || null,
      },
    };
  }

  async function getOrderByTrackingToken(token) {
    if (!token || typeof token !== 'string' || token.length > 255) {
      throw new NotFoundError('Starter kit order not found');
    }
    const order = await db.t_starter_kit_order.findOne({ tracking_token_hash: hashToken(token), is_deleted: false });
    if (!order) {
      throw new NotFoundError('Starter kit order not found');
    }
    return order;
  }

  async function getPublicOrder(token) {
    const order = await getOrderByTrackingToken(token);
    return toPublicOrder(order);
  }

  async function selectPickupPoint(token, data) {
    const order = await getOrderByTrackingToken(token);
    if (order.shipment_number || TERMINAL_STATUSES.includes(order.status)) {
      throw new ForbiddenError('The pickup point cannot be changed anymore');
    }
    const pickupPoint = validate(schema.pickupPointSchema, data, 'pickup_point');
    const updatedOrder = await db.t_starter_kit_order.update(order.id, {
      pickup_point: pickupPoint,
      pickup_point_selected_at: new Date(),
      updated_at: new Date(),
    });
    await addEvent(order.id, EVENT_TYPE.PICKUP_POINT_SELECTED, { pickup_point: pickupPoint });
    await notifyAdmin(
      `📍 Starter kit: ${order.email} selected pickup point ${pickupPoint.name} (${pickupPoint.postal_code || ''} ${
        pickupPoint.city || ''
      })`,
    );
    return toPublicOrder(updatedOrder);
  }

  async function getOrders(query) {
    const value = validate(schema.listOrdersSchema, query, 'starter_kit_order_query');
    const criteria = { is_deleted: false };
    if (value.status === 'open') {
      criteria['status <>'] = TERMINAL_STATUSES;
    } else if (value.status) {
      criteria.status = value.status;
    }
    const [orders, countsByStatus] = await Promise.all([
      db.t_starter_kit_order.find(criteria, {
        order: [{ field: 'created_at', direction: 'desc' }],
        limit: value.limit,
        offset: value.offset,
      }),
      db.query(
        'SELECT status, COUNT(*)::int AS count FROM t_starter_kit_order WHERE is_deleted = false GROUP BY status',
      ),
    ]);
    const counts = {};
    countsByStatus.forEach((row) => {
      counts[row.status] = row.count;
    });
    return { orders, counts };
  }

  async function getOrderById(id) {
    const order = await getOrderOrFail(id);
    const events = await db.t_starter_kit_order_event.find(
      { order_id: id },
      { order: [{ field: 'created_at', direction: 'asc' }] },
    );
    return {
      ...order,
      status_label: getStatusLabel(order.status, order.language),
      status_history: getStatusHistory(order),
      shipment_tracking_url: getShipmentTrackingUrl(order),
      ssh_username: process.env.STARTER_KIT_SSH_USERNAME || DEFAULT_SSH_USERNAME,
      events,
    };
  }

  /**
   * Manual order creation from the admin API (order outside Stripe, or import of the
   * orders currently handled by hand).
   */
  async function createOrder(data) {
    const value = validate(schema.createOrderSchema, data, 'starter_kit_order');
    const { send_email: sendConfirmationEmail, ...orderData } = value;
    if (orderData.pickup_point) {
      orderData.pickup_point_selected_at = new Date();
    }
    const order = await insertOrder(orderData, { sendConfirmationEmail });
    return getOrderById(order.id);
  }

  async function updateOrder(id, data) {
    await getOrderOrFail(id);
    const value = validate(schema.updateOrderSchema, data, 'starter_kit_order');
    if (value.pickup_point) {
      value.pickup_point_selected_at = new Date();
    }
    await db.t_starter_kit_order.update(id, { ...value, updated_at: new Date() });
    return getOrderById(id);
  }

  async function createLabel(id) {
    const order = await getOrderOrFail(id);
    if (order.shipment_number) {
      throw new BadRequestError(`A shipment already exists for this order (${order.shipment_number})`);
    }
    if (!order.pickup_point) {
      throw new BadRequestError('The customer has not selected a pickup point yet');
    }
    if (!mondialRelayService.isConfigured()) {
      throw new BadRequestError(
        'Mondial Relay API is not configured (MONDIAL_RELAY_ENSEIGNE / MONDIAL_RELAY_PRIVATE_KEY)',
      );
    }
    const address = order.shipping_address || {};
    let shipment;
    try {
      shipment = await mondialRelayService.createPickupPointShipment({
        reference: order.id.replace(/-/g, '').slice(0, 15).toUpperCase(),
        recipient: {
          name: order.customer_name || order.email,
          address_1: address.line1 || order.pickup_point.address_1,
          address_2: address.line2 || '',
          postal_code: address.postal_code || order.pickup_point.postal_code,
          city: address.city || order.pickup_point.city,
          country: address.country || order.pickup_point.country || 'FR',
          phone: order.phone,
          email: order.email,
        },
        pickupPoint: { id: order.pickup_point.id, country: order.pickup_point.country || 'FR' },
      });
    } catch (e) {
      logger.warn(`Starter kit: Mondial Relay shipment creation failed for order ${id}`);
      logger.warn(e);
      throw new BadGatewayError(e.message, 'mondial-relay');
    }
    await db.t_starter_kit_order.update(id, {
      shipment_number: shipment.shipment_number,
      label_url: shipment.label_url,
      updated_at: new Date(),
    });
    await addEvent(id, EVENT_TYPE.LABEL_CREATED, shipment);
    return getOrderById(id);
  }

  function assertTransition(order, targetStatus) {
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new ForbiddenError(`Order is ${order.status}, its status cannot be changed anymore`);
    }
    if (targetStatus === STATUS.CANCELLED) {
      return;
    }
    const currentIndex = ORDERED_STATUSES.indexOf(order.status);
    const targetIndex = ORDERED_STATUSES.indexOf(targetStatus);
    if (targetIndex <= currentIndex) {
      throw new BadRequestError(`Cannot move an order from ${order.status} to ${targetStatus}`);
    }
  }

  async function changeStatus(id, data) {
    const value = validate(schema.changeStatusSchema, data, 'starter_kit_order_status');
    let order = await getOrderOrFail(id);
    assertTransition(order, value.status);

    const toUpdate = { updated_at: new Date() };
    if (value.mini_pc_expected_at !== undefined) {
      toUpdate.mini_pc_expected_at = value.mini_pc_expected_at;
    }
    if (value.shipment_number) {
      toUpdate.shipment_number = value.shipment_number;
    }
    if (value.status === STATUS.SHIPPED && !order.shipment_number && !value.shipment_number) {
      // No tracking number yet: create the Mondial Relay shipment now
      order = await createLabel(id);
    }
    if (value.status === STATUS.SHIPPED && !order.shipment_number && !value.shipment_number) {
      throw new BadRequestError('A shipment_number is required to mark the order as shipped');
    }

    const previousStatus = order.status;
    const now = new Date();
    toUpdate.status = value.status;
    toUpdate[STATUS_DATE_COLUMN[value.status]] = now;
    if (value.note) {
      toUpdate.notes = order.notes ? `${order.notes}\n${value.note}` : value.note;
    }
    const updatedOrder = await db.t_starter_kit_order.update(id, toUpdate);
    await addEvent(id, EVENT_TYPE.STATUS_CHANGED, { from: previousStatus, to: value.status, note: value.note || null });
    logger.info(`Starter kit: order ${id} moved from ${previousStatus} to ${value.status}`);

    const template = STATUS_EMAIL_TEMPLATE[value.status];
    const shouldNotify = value.notify === undefined ? Boolean(template) : value.notify && Boolean(template);
    if (shouldNotify) {
      // The status is already saved: an email failure must not look like a failed
      // transition (retrying it would be refused). Warn, alert, and let the admin
      // use resend-email.
      try {
        await sendEmail(updatedOrder, template);
      } catch (e) {
        logger.warn(`Starter kit: unable to send ${template} email for order ${id}`);
        logger.warn(e);
        await notifyAdmin(
          `⚠️ Starter kit: order ${id} moved to ${value.status} but the "${template}" email could not be sent to ${updatedOrder.email}`,
        );
      }
    }
    return getOrderById(id);
  }

  async function resendEmail(id, data) {
    const value = validate(schema.resendEmailSchema, data, 'starter_kit_order_email');
    const order = await getOrderOrFail(id);
    await sendEmail(order, value.template);
    return getOrderById(id);
  }

  // Remind customers who have not selected a pickup point a few days after their order
  async function sendPickupPointReminders() {
    if (!process.env.STARTER_KIT_TRACKING_URL) {
      logger.warn('Starter kit: STARTER_KIT_TRACKING_URL is not set, not sending pickup point reminders');
      return [];
    }
    const days = parseInt(process.env.STARTER_KIT_PICKUP_POINT_REMINDER_DAYS, 10) || DEFAULT_PICKUP_POINT_REMINDER_DAYS;
    const orders = await db.t_starter_kit_order.find({
      is_deleted: false,
      'status <>': [STATUS.SHIPPED, STATUS.DELIVERED, STATUS.CANCELLED],
      pickup_point: null,
      pickup_point_reminder_sent_at: null,
      'created_at <': new Date(Date.now() - days * ONE_DAY_IN_MS),
    });
    const reminded = [];
    await Promise.mapSeries(orders, async (order) => {
      try {
        await sendEmail(order, 'starter_kit_pickup_point_reminder');
        await db.t_starter_kit_order.update(order.id, {
          pickup_point_reminder_sent_at: new Date(),
          updated_at: new Date(),
        });
        reminded.push(order.id);
      } catch (e) {
        logger.warn(`Starter kit: unable to send pickup point reminder for order ${order.id}`);
        logger.warn(e);
      }
    });
    return reminded;
  }

  // Poll Mondial Relay tracking for shipped orders and mark them as delivered
  async function refreshShipmentTracking() {
    if (!mondialRelayService.isConfigured()) {
      return [];
    }
    const orders = await db.t_starter_kit_order.find({
      is_deleted: false,
      status: STATUS.SHIPPED,
      'shipment_number <>': null,
    });
    const delivered = [];
    await Promise.mapSeries(orders, async (order) => {
      try {
        const tracking = await mondialRelayService.getTracking(order.shipment_number, order.language);
        if (tracking.delivered) {
          await changeStatus(order.id, { status: STATUS.DELIVERED });
          delivered.push(order.id);
        }
      } catch (e) {
        logger.warn(`Starter kit: unable to refresh tracking of order ${order.id} (${order.shipment_number})`);
        logger.warn(e);
      }
    });
    return delivered;
  }

  async function sendDailyDigest() {
    const openOrders = await db.t_starter_kit_order.find({ is_deleted: false, 'status <>': TERMINAL_STATUSES });
    if (openOrders.length === 0) {
      return null;
    }
    const lines = ORDERED_STATUSES.filter((status) => !TERMINAL_STATUSES.includes(status))
      .map((status) => ({ status, count: openOrders.filter((order) => order.status === status).length }))
      .filter((item) => item.count > 0)
      .map((item) => `• ${item.status}: ${item.count}`);
    const readyWithoutPickupPoint = openOrders.filter(
      (order) => order.status === STATUS.INSTALLED && !order.pickup_point,
    );
    let text = `📦 Starter kit orders in progress (${openOrders.length}):\n${lines.join('\n')}`;
    if (readyWithoutPickupPoint.length > 0) {
      text += `\n⚠️ Installed but waiting for a pickup point: ${readyWithoutPickupPoint
        .map((order) => order.email)
        .join(', ')}`;
    }
    await notifyAdmin(text);
    return text;
  }

  async function runDailyTasks() {
    const reminded = await sendPickupPointReminders();
    const delivered = await refreshShipmentTracking();
    await sendDailyDigest();
    return { reminded, delivered };
  }

  return {
    isStarterKitCheckoutSession,
    createOrderFromStripeSession,
    createOrder,
    getPublicOrder,
    selectPickupPoint,
    getOrders,
    getOrderById,
    updateOrder,
    createLabel,
    changeStatus,
    resendEmail,
    runDailyTasks,
    // exported for tests
    hashToken,
    getTrackingUrl,
    computeTrackingToken,
  };
};

module.exports.computeTrackingToken = computeTrackingToken;
module.exports.hashToken = hashToken;
