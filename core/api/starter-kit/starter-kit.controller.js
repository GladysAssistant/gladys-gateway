/**
 * Starter kit orders. Public routes are used by the customer tracking page (token from the
 * email), admin routes are part of the Admin API (see core/middleware/adminAuth.js) and every
 * mutation is logged with who did it (audit trail, ids only, never emails).
 */
module.exports = function StarterKitController(logger, starterKitModel) {
  function describeCaller(req) {
    const { admin } = req;
    const who = admin.auth_mode === 'api_key' ? `api key ${admin.api_key_name}` : `super admin ${admin.user_id}`;
    return `${who} from ${req.ip}`;
  }

  function audit(req, action) {
    logger.warn(`Admin API audit: ${action} by ${describeCaller(req)}`);
  }

  /**
   * @api {get} /starter-kit/orders/:token Get starter kit order (customer tracking page)
   * @apiName Get starter kit order
   * @apiGroup StarterKit
   *
   * @apiParam {String} token Tracking token sent by email to the customer
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "id": "5f0c5a2a-6a0b-4b53-9c3a-0a0d2e3f4a01",
   *   "status": "mini_pc_ordered",
   *   "status_label": "Mini-PC commandé",
   *   "status_history": [{ "status": "paid", "at": "2026-09-01T10:00:00.000Z", "label": "Commande confirmée" }],
   *   "pickup_point": null,
   *   "can_select_pickup_point": true,
   *   "shipment_number": null,
   *   "shipment_tracking_url": null,
   *   "training": { "url": "https://formation.gladysassistant.com/...", "code": "XXXX" },
   *   "mondial_relay": { "widget_brand_code": "BDTEST", "country": "FR", "postal_code": "75011" }
   * }
   */
  async function getPublicOrder(req, res, next) {
    const order = await starterKitModel.getPublicOrder(req.params.token);
    res.json(order);
  }

  /**
   * @api {post} /starter-kit/orders/:token/pickup-point Select the Mondial Relay pickup point
   * @apiName Select pickup point
   * @apiGroup StarterKit
   *
   * @apiParam {String} token Tracking token sent by email to the customer
   * @apiParam {String} id Mondial Relay pickup point id (widget `ID`)
   * @apiParam {String} name Pickup point name (widget `Nom`)
   * @apiParam {String} address_1 (widget `Adresse1`)
   * @apiParam {String} address_2 (widget `Adresse2`)
   * @apiParam {String} postal_code (widget `CP`)
   * @apiParam {String} city (widget `Ville`)
   * @apiParam {String} country (widget `Pays`)
   */
  async function selectPickupPoint(req, res, next) {
    const order = await starterKitModel.selectPickupPoint(req.params.token, req.body);
    res.json(order);
  }

  /**
   * @api {get} /admin/api/starter-kit/orders List starter kit orders
   * @apiName List starter kit orders
   * @apiGroup Admin API
   * @apiHeader {String} [X-Admin-Api-Key] Admin API key (machine access)
   * @apiHeader {String} [Authorization] Super admin access token (Bearer JWT)
   *
   * @apiParam {String} [status] Filter by status, or "open" for orders not delivered/cancelled
   * @apiParam {Number} [limit=50]
   * @apiParam {Number} [offset=0]
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "orders": [],
   *   "counts": { "paid": 1, "shipped": 2 }
   * }
   */
  async function getOrders(req, res, next) {
    const result = await starterKitModel.getOrders(req.query);
    res.json(result);
  }

  /**
   * @api {get} /admin/api/starter-kit/orders/:id Get starter kit order
   * @apiName Get starter kit order (admin)
   * @apiGroup Admin API
   * @apiHeader {String} [X-Admin-Api-Key] Admin API key (machine access)
   * @apiHeader {String} [Authorization] Super admin access token (Bearer JWT)
   */
  async function getOrder(req, res, next) {
    const order = await starterKitModel.getOrderById(req.params.id);
    res.json(order);
  }

  /**
   * @api {post} /admin/api/starter-kit/orders Create starter kit order manually
   * @apiName Create starter kit order
   * @apiGroup Admin API
   * @apiHeader {String} [X-Admin-Api-Key] Admin API key (machine access)
   * @apiHeader {String} [Authorization] Super admin access token (Bearer JWT)
   *
   * @apiParam {String} email
   * @apiParam {String} [customer_name]
   * @apiParam {String} [phone]
   * @apiParam {string="en","fr"} [language=fr]
   * @apiParam {Object} [shipping_address] { line1, line2, postal_code, city, country }
   * @apiParam {String} [status=paid]
   * @apiParam {Boolean} [send_email=false] Send the confirmation email to the customer
   */
  async function createOrder(req, res, next) {
    const order = await starterKitModel.createOrder(req.body);
    audit(req, `create starter kit order ${order.id}`);
    res.status(201).json(order);
  }

  /**
   * @api {patch} /admin/api/starter-kit/orders/:id Update starter kit order
   * @apiName Update starter kit order
   * @apiGroup Admin API
   * @apiHeader {String} [X-Admin-Api-Key] Admin API key (machine access)
   * @apiHeader {String} [Authorization] Super admin access token (Bearer JWT)
   *
   * @apiParam {String} [notes]
   * @apiParam {String} [ssh_password]
   * @apiParam {Date} [mini_pc_expected_at]
   * @apiParam {String} [shipment_number]
   * @apiParam {Object} [pickup_point]
   * @apiParam {Object} [shipping_address]
   */
  async function updateOrder(req, res, next) {
    const order = await starterKitModel.updateOrder(req.params.id, req.body);
    audit(req, `update starter kit order ${order.id}`);
    res.json(order);
  }

  /**
   * @api {post} /admin/api/starter-kit/orders/:id/status Change order status
   * @apiName adminChangeStarterKitOrderStatus
   * @apiGroup Admin API
   * @apiHeader {String} [X-Admin-Api-Key] Admin API key (machine access)
   * @apiHeader {String} [Authorization] Super admin access token (Bearer JWT)
   *
   * @apiParam {string="mini_pc_ordered","mini_pc_received","installed","shipped","delivered","cancelled"} status
   * @apiParam {Date} [mini_pc_expected_at] Expected reception date of the mini-PC
   * @apiParam {String} [shipment_number] Tracking number, when the label was created outside the API
   * @apiParam {Boolean} [notify] Force/disable the customer email for this status
   * @apiParam {String} [note] Internal note appended to the order
   */
  async function changeStatus(req, res, next) {
    const order = await starterKitModel.changeStatus(req.params.id, req.body);
    audit(req, `move starter kit order ${order.id} to ${order.status}`);
    res.json(order);
  }

  /**
   * @api {post} /admin/api/starter-kit/orders/:id/label Create the Mondial Relay shipment and label
   * @apiName Create starter kit label
   * @apiGroup Admin API
   * @apiHeader {String} [X-Admin-Api-Key] Admin API key (machine access)
   * @apiHeader {String} [Authorization] Super admin access token (Bearer JWT)
   */
  async function createLabel(req, res, next) {
    const order = await starterKitModel.createLabel(req.params.id);
    audit(req, `create Mondial Relay label of starter kit order ${order.id}`);
    res.json(order);
  }

  /**
   * @api {post} /admin/api/starter-kit/orders/:id/resend-email Send again an email to the customer
   * @apiName Resend starter kit email
   * @apiGroup Admin API
   * @apiHeader {String} [X-Admin-Api-Key] Admin API key (machine access)
   * @apiHeader {String} [Authorization] Super admin access token (Bearer JWT)
   *
   * @apiParam {String} template starter_kit_order_confirmed, starter_kit_pickup_point_reminder,
   * starter_kit_status_update, starter_kit_shipped or starter_kit_delivered
   */
  async function resendEmail(req, res, next) {
    const order = await starterKitModel.resendEmail(req.params.id, req.body);
    audit(req, `resend ${req.body.template} email of starter kit order ${order.id}`);
    res.json(order);
  }

  /**
   * @api {post} /admin/api/starter-kit/daily Run starter kit daily tasks
   * @apiName Starter kit daily tasks
   * @apiGroup Admin API
   * @apiHeader {String} [X-Admin-Api-Key] Admin API key (machine access)
   * @apiHeader {String} [Authorization] Super admin access token (Bearer JWT)
   *
   * @apiDescription Sends pickup point reminders, refreshes Mondial Relay tracking
   * (orders are marked as delivered automatically) and posts a digest on Telegram.
   */
  async function runDailyTasks(req, res, next) {
    const result = await starterKitModel.runDailyTasks();
    audit(
      req,
      `run starter kit daily tasks (${result.reminded.length} reminded, ${result.delivered.length} delivered)`,
    );
    res.json({ status: 200, ...result });
  }

  return {
    getPublicOrder,
    selectPickupPoint,
    getOrders,
    getOrder,
    createOrder,
    updateOrder,
    changeStatus,
    createLabel,
    resendEmail,
    runDailyTasks,
  };
};
