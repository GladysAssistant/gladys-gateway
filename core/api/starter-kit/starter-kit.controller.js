module.exports = function StarterKitController(starterKitModel) {
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
   * @api {get} /admin/starter-kit/orders List starter kit orders
   * @apiName List starter kit orders
   * @apiGroup StarterKitAdmin
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
   * @api {get} /admin/starter-kit/orders/:id Get starter kit order
   * @apiName Get starter kit order (admin)
   * @apiGroup StarterKitAdmin
   */
  async function getOrder(req, res, next) {
    const order = await starterKitModel.getOrderById(req.params.id);
    res.json(order);
  }

  /**
   * @api {post} /admin/starter-kit/orders Create starter kit order manually
   * @apiName Create starter kit order
   * @apiGroup StarterKitAdmin
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
    res.status(201).json(order);
  }

  /**
   * @api {patch} /admin/starter-kit/orders/:id Update starter kit order
   * @apiName Update starter kit order
   * @apiGroup StarterKitAdmin
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
    res.json(order);
  }

  /**
   * @api {post} /admin/starter-kit/orders/:id/status Change order status
   * @apiName Change starter kit order status
   * @apiGroup StarterKitAdmin
   *
   * @apiParam {string="mini_pc_ordered","mini_pc_received","installed","shipped","delivered","cancelled"} status
   * @apiParam {Date} [mini_pc_expected_at] Expected reception date of the mini-PC
   * @apiParam {String} [shipment_number] Tracking number, when the label was created outside the API
   * @apiParam {Boolean} [notify] Force/disable the customer email for this status
   * @apiParam {String} [note] Internal note appended to the order
   */
  async function changeStatus(req, res, next) {
    const order = await starterKitModel.changeStatus(req.params.id, req.body);
    res.json(order);
  }

  /**
   * @api {post} /admin/starter-kit/orders/:id/label Create the Mondial Relay shipment and label
   * @apiName Create starter kit label
   * @apiGroup StarterKitAdmin
   */
  async function createLabel(req, res, next) {
    const order = await starterKitModel.createLabel(req.params.id);
    res.json(order);
  }

  /**
   * @api {post} /admin/starter-kit/orders/:id/resend-email Send again an email to the customer
   * @apiName Resend starter kit email
   * @apiGroup StarterKitAdmin
   *
   * @apiParam {String} template starter_kit_order_confirmed, starter_kit_pickup_point_reminder,
   * starter_kit_status_update, starter_kit_shipped or starter_kit_delivered
   */
  async function resendEmail(req, res, next) {
    const order = await starterKitModel.resendEmail(req.params.id, req.body);
    res.json(order);
  }

  /**
   * @api {post} /admin/api/starter-kit/daily Daily starter kit tasks (cron)
   * @apiName Starter kit daily tasks
   * @apiGroup StarterKitAdmin
   *
   * @apiDescription Sends pickup point reminders, refreshes Mondial Relay tracking
   * (orders are marked as delivered automatically) and posts a digest on Telegram.
   */
  async function runDailyTasks(req, res, next) {
    const result = await starterKitModel.runDailyTasks();
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
