const request = require('supertest');
const nock = require('nock');
const { expect } = require('chai');
const configTest = require('../../../tasks/config');
const { setupPersistentNocks } = require('../../../tasks/nock');
const { computeTrackingToken, hashToken } = require('../../../../core/api/starter-kit/starter-kit.model');

const SUPER_ADMIN_USER_ID = 'a139e4a6-ec6c-442d-9730-0499155d38d4';
const ORDER_PAID = '5f0c5a2a-6a0b-4b53-9c3a-0a0d2e3f4a01';
const ORDER_INSTALLED = '5f0c5a2a-6a0b-4b53-9c3a-0a0d2e3f4a02';
const ORDER_SHIPPED = '5f0c5a2a-6a0b-4b53-9c3a-0a0d2e3f4a03';

const soapResponse = (method, inner) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method}Response xmlns="http://www.mondialrelay.fr/webservice/"><${method}Result>${inner}</${method}Result></${method}Response></soap:Body></soap:Envelope>`;

function admin(req) {
  return req.set('Accept', 'application/json').set('Authorization', configTest.jwtAccessTokenDashboard);
}

// Emails sent during the test (the fixtures contain an old confirmation email event)
async function getEmailEvents(orderId) {
  const events = await TEST_DATABASE_INSTANCE.t_starter_kit_order_event.find(
    { order_id: orderId, type: 'email_sent', 'created_at >': new Date(Date.now() - 60 * 1000) },
    { order: [{ field: 'created_at', direction: 'asc' }] },
  );
  return events.map((event) => event.payload.template);
}

describe('Starter kit admin API', () => {
  let previousSuperAdminUserId;
  before(() => {
    previousSuperAdminUserId = process.env.SUPER_ADMIN_USER_ID;
  });
  after(() => {
    process.env.SUPER_ADMIN_USER_ID = previousSuperAdminUserId;
  });
  beforeEach(() => {
    process.env.SUPER_ADMIN_USER_ID = SUPER_ADMIN_USER_ID;
    process.env.STARTER_KIT_TRACKING_URL = 'https://gladysassistant.com/fr/starter-kit/suivi';
  });
  afterEach(() => {
    delete process.env.MONDIAL_RELAY_ENSEIGNE;
    delete process.env.MONDIAL_RELAY_PRIVATE_KEY;
    nock.cleanAll();
    setupPersistentNocks();
  });

  describe('authorization', () => {
    it('should refuse a user who is not the super admin', async () => {
      process.env.SUPER_ADMIN_USER_ID = 'other_id';
      await admin(request(TEST_BACKEND_APP).get('/admin/starter-kit/orders')).expect(401);
    });

    it('should refuse the cron route without the admin API token', async () => {
      await request(TEST_BACKEND_APP).post('/admin/api/starter-kit/daily').expect(401);
    });
  });

  describe('GET /admin/starter-kit/orders', () => {
    it('should list orders with counts by status', async () => {
      const response = await admin(request(TEST_BACKEND_APP).get('/admin/starter-kit/orders')).expect(200);
      expect(response.body.orders).to.have.lengthOf(3);
      expect(response.body.counts).to.deep.equal({ paid: 1, installed: 1, shipped: 1 });
      expect(response.body.orders[0]).to.have.property('email');
    });

    it('should filter by status', async () => {
      const response = await admin(request(TEST_BACKEND_APP).get('/admin/starter-kit/orders?status=shipped')).expect(
        200,
      );
      expect(response.body.orders).to.have.lengthOf(1);
      expect(response.body.orders[0]).to.have.property('id', ORDER_SHIPPED);
    });

    it('should reject an invalid status filter', async () => {
      await admin(request(TEST_BACKEND_APP).get('/admin/starter-kit/orders?status=nope')).expect(422);
    });
  });

  describe('GET /admin/starter-kit/orders/:id', () => {
    it('should return the order with its events', async () => {
      const response = await admin(request(TEST_BACKEND_APP).get(`/admin/starter-kit/orders/${ORDER_PAID}`)).expect(
        200,
      );
      expect(response.body).to.include({
        id: ORDER_PAID,
        email: 'starter-kit-paid@gladysassistant.com',
        ssh_password: 'ssh-password-paid',
        ssh_username: 'gladys',
        status_label: 'Commande confirmée',
      });
      expect(response.body.events).to.have.lengthOf(2);
      expect(response.body.status_history).to.have.lengthOf(1);
    });

    it('should return 404 for an unknown order', async () => {
      await admin(
        request(TEST_BACKEND_APP).get('/admin/starter-kit/orders/00000000-0000-4000-8000-000000000000'),
      ).expect(404);
    });
  });

  describe('POST /admin/starter-kit/orders', () => {
    it('should create an order manually and send the confirmation email', async () => {
      const response = await admin(request(TEST_BACKEND_APP).post('/admin/starter-kit/orders'))
        .send({
          email: 'Manual@Test.fr',
          customer_name: 'Manuel Test',
          language: 'fr',
          shipping_address: { line1: '1 rue Test', postal_code: '44000', city: 'Nantes', country: 'FR' },
          status: 'mini_pc_ordered',
          notes: 'Commande par email',
          send_email: true,
        })
        .expect(201);
      expect(response.body).to.include({
        email: 'manual@test.fr',
        status: 'mini_pc_ordered',
        notes: 'Commande par email',
      });
      expect(response.body.ssh_password).to.have.lengthOf(16);
      expect(response.body.mini_pc_ordered_at).to.not.equal(null);
      expect(await getEmailEvents(response.body.id)).to.deep.equal(['starter_kit_order_confirmed']);
    });

    it('should create an order without email by default', async () => {
      const response = await admin(request(TEST_BACKEND_APP).post('/admin/starter-kit/orders'))
        .send({ email: 'silent@test.fr' })
        .expect(201);
      expect(await getEmailEvents(response.body.id)).to.deep.equal([]);
    });

    it('should validate the body', async () => {
      await admin(request(TEST_BACKEND_APP).post('/admin/starter-kit/orders')).send({ email: 'nope' }).expect(422);
    });
  });

  describe('PATCH /admin/starter-kit/orders/:id', () => {
    it('should update notes, expected date and pickup point', async () => {
      const response = await admin(request(TEST_BACKEND_APP).patch(`/admin/starter-kit/orders/${ORDER_PAID}`))
        .send({
          notes: 'Client joignable le soir',
          mini_pc_expected_at: '2026-09-12',
          pickup_point: { id: '111111', name: 'RELAIS TEST', postal_code: '75011', city: 'Paris', country: 'FR' },
        })
        .expect(200);
      expect(response.body).to.have.property('notes', 'Client joignable le soir');
      expect(response.body.mini_pc_expected_at).to.include('2026-09-1');
      expect(response.body.pickup_point).to.have.property('id', '111111');
      expect(response.body.pickup_point_selected_at).to.not.equal(null);
    });

    it('should not allow to change the status through PATCH', async () => {
      await admin(request(TEST_BACKEND_APP).patch(`/admin/starter-kit/orders/${ORDER_PAID}`))
        .send({ status: 'shipped' })
        .expect(422);
    });
  });

  describe('POST /admin/starter-kit/orders/:id/status', () => {
    it('should move the order to mini_pc_ordered and email the customer', async () => {
      const response = await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_PAID}/status`))
        .send({ status: 'mini_pc_ordered', mini_pc_expected_at: '2026-09-12', note: 'Commandé sur Amazon' })
        .expect(200);
      expect(response.body).to.include({ status: 'mini_pc_ordered', notes: 'Commandé sur Amazon' });
      expect(response.body.mini_pc_ordered_at).to.not.equal(null);
      expect(response.body.status_history.map((item) => item.status)).to.deep.equal(['paid', 'mini_pc_ordered']);
      expect(await getEmailEvents(ORDER_PAID)).to.deep.equal(['starter_kit_status_update']);
      const statusEvents = await TEST_DATABASE_INSTANCE.t_starter_kit_order_event.find({
        order_id: ORDER_PAID,
        type: 'status_changed',
      });
      expect(statusEvents.map((e) => e.payload.to)).to.include('mini_pc_ordered');
    });

    it('should allow to skip steps and not email on mini_pc_received', async () => {
      const response = await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_PAID}/status`))
        .send({ status: 'mini_pc_received' })
        .expect(200);
      expect(response.body).to.have.property('status', 'mini_pc_received');
      expect(await getEmailEvents(ORDER_PAID)).to.deep.equal([]);
    });

    it('should let notify=false silence the customer email', async () => {
      await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_PAID}/status`))
        .send({ status: 'installed', notify: false })
        .expect(200);
      expect(await getEmailEvents(ORDER_PAID)).to.deep.equal([]);
    });

    it('should refuse to go backward', async () => {
      await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_INSTALLED}/status`))
        .send({ status: 'paid' })
        .expect(400);
    });

    it('should refuse an unknown status', async () => {
      await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_INSTALLED}/status`))
        .send({ status: 'lost' })
        .expect(422);
    });

    it('should ship with a tracking number given manually (no Mondial Relay API)', async () => {
      const response = await admin(
        request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_INSTALLED}/status`),
      )
        .send({ status: 'shipped', shipment_number: '87654321' })
        .expect(200);
      expect(response.body).to.include({ status: 'shipped', shipment_number: '87654321' });
      expect(response.body.shipment_tracking_url).to.equal(
        'https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=87654321&codePostal=69001',
      );
      expect(await getEmailEvents(ORDER_INSTALLED)).to.deep.equal(['starter_kit_shipped']);
    });

    it('should refuse to ship without tracking number when Mondial Relay is not configured', async () => {
      const response = await admin(
        request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_INSTALLED}/status`),
      )
        .send({ status: 'shipped' })
        .expect(400);
      expect(response.body.error_message).to.include('Mondial Relay API is not configured');
    });

    it('should create the Mondial Relay shipment when shipping without tracking number', async () => {
      process.env.MONDIAL_RELAY_ENSEIGNE = 'BDTEST13';
      process.env.MONDIAL_RELAY_PRIVATE_KEY = 'PrivateK';
      let requestBody;
      nock('https://api.mondialrelay.com')
        .post('/Web_Services.asmx', (body) => {
          requestBody = body;
          return body.includes('<WSI2_CreationEtiquette');
        })
        .reply(
          200,
          soapResponse(
            'WSI2_CreationEtiquette',
            '<STAT>0</STAT><ExpeditionNum>31234567</ExpeditionNum><URL_Etiquette>/ww2/PDF/label.aspx</URL_Etiquette>',
          ),
        );
      const response = await admin(
        request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_INSTALLED}/status`),
      )
        .send({ status: 'shipped' })
        .expect(200);
      expect(response.body).to.include({
        status: 'shipped',
        shipment_number: '31234567',
        label_url: 'https://www.mondialrelay.com/ww2/PDF/label.aspx',
      });
      expect(requestBody).to.include('<LIV_Rel>012345</LIV_Rel>');
      expect(requestBody).to.include('<Dest_Ad1>MARIE CURIE</Dest_Ad1>');
      expect(requestBody).to.include('<Dest_Ad3>1 AVENUE DE LA REPUBLIQUE</Dest_Ad3>');
      const events = await TEST_DATABASE_INSTANCE.t_starter_kit_order_event.find({
        order_id: ORDER_INSTALLED,
        type: 'label_created',
      });
      expect(events).to.have.lengthOf(1);
      expect(await getEmailEvents(ORDER_INSTALLED)).to.deep.equal(['starter_kit_shipped']);
    });

    it('should mark a shipped order as delivered and email the customer', async () => {
      const response = await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_SHIPPED}/status`))
        .send({ status: 'delivered' })
        .expect(200);
      expect(response.body).to.have.property('status', 'delivered');
      expect(await getEmailEvents(ORDER_SHIPPED)).to.deep.equal(['starter_kit_delivered']);
      // terminal: no more changes
      await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_SHIPPED}/status`))
        .send({ status: 'cancelled' })
        .expect(403);
    });

    it('should cancel an order without emailing the customer', async () => {
      const response = await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_PAID}/status`))
        .send({ status: 'cancelled', note: 'Remboursé' })
        .expect(200);
      expect(response.body).to.have.property('status', 'cancelled');
      expect(response.body.cancelled_at).to.not.equal(null);
      expect(await getEmailEvents(ORDER_PAID)).to.deep.equal([]);
    });
  });

  describe('POST /admin/starter-kit/orders/:id/label', () => {
    it('should create the label without changing the status', async () => {
      process.env.MONDIAL_RELAY_ENSEIGNE = 'BDTEST13';
      process.env.MONDIAL_RELAY_PRIVATE_KEY = 'PrivateK';
      nock('https://api.mondialrelay.com')
        .post('/Web_Services.asmx')
        .reply(
          200,
          soapResponse(
            'WSI2_CreationEtiquette',
            '<STAT>0</STAT><ExpeditionNum>31234568</ExpeditionNum><URL_Etiquette>https://www.mondialrelay.com/label.pdf</URL_Etiquette>',
          ),
        );
      const response = await admin(
        request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_INSTALLED}/label`),
      ).expect(200);
      expect(response.body).to.include({
        status: 'installed',
        shipment_number: '31234568',
        label_url: 'https://www.mondialrelay.com/label.pdf',
      });
      expect(await getEmailEvents(ORDER_INSTALLED)).to.deep.equal([]);
      // Shipping afterwards reuses the existing shipment
      const shipped = await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_INSTALLED}/status`))
        .send({ status: 'shipped' })
        .expect(200);
      expect(shipped.body).to.include({ status: 'shipped', shipment_number: '31234568' });
    });

    it('should refuse to create a label without pickup point', async () => {
      process.env.MONDIAL_RELAY_ENSEIGNE = 'BDTEST13';
      process.env.MONDIAL_RELAY_PRIVATE_KEY = 'PrivateK';
      await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_PAID}/label`)).expect(400);
    });

    it('should refuse to create a label twice', async () => {
      process.env.MONDIAL_RELAY_ENSEIGNE = 'BDTEST13';
      process.env.MONDIAL_RELAY_PRIVATE_KEY = 'PrivateK';
      await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_SHIPPED}/label`)).expect(400);
    });

    it('should surface Mondial Relay errors as 502', async () => {
      process.env.MONDIAL_RELAY_ENSEIGNE = 'BDTEST13';
      process.env.MONDIAL_RELAY_PRIVATE_KEY = 'PrivateK';
      nock('https://api.mondialrelay.com')
        .post('/Web_Services.asmx')
        .reply(200, soapResponse('WSI2_CreationEtiquette', '<STAT>14</STAT>'));
      const response = await admin(
        request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_INSTALLED}/label`),
      ).expect(502);
      expect(response.body.error_message).to.include('Numéro de Relais de livraison invalide');
    });
  });

  describe('POST /admin/starter-kit/orders/:id/resend-email', () => {
    it('should send again an email with the stable tracking token of the order', async () => {
      await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_PAID}/resend-email`))
        .send({ template: 'starter_kit_order_confirmed' })
        .expect(200);
      expect(await getEmailEvents(ORDER_PAID)).to.deep.equal(['starter_kit_order_confirmed']);
      // The token derived from the order id is now the one stored (the fixture token is replaced)
      const token = computeTrackingToken(ORDER_PAID);
      const after = await TEST_DATABASE_INSTANCE.t_starter_kit_order.findOne({ id: ORDER_PAID });
      expect(after.tracking_token_hash).to.equal(hashToken(token));
      await request(TEST_BACKEND_APP).get(`/starter-kit/orders/${token}`).expect(200);
      await request(TEST_BACKEND_APP).get('/starter-kit/orders/token-paid').expect(404);
      // Sending another email keeps the same token
      await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_PAID}/resend-email`))
        .send({ template: 'starter_kit_status_update' })
        .expect(200);
      await request(TEST_BACKEND_APP).get(`/starter-kit/orders/${token}`).expect(200);
    });

    it('should reject an unknown template', async () => {
      await admin(request(TEST_BACKEND_APP).post(`/admin/starter-kit/orders/${ORDER_PAID}/resend-email`))
        .send({ template: 'welcome' })
        .expect(422);
    });
  });

  describe('DELETE /admin/accounts/:id with a starter kit order', () => {
    it('should keep the order and unlink the deleted account', async () => {
      const accountId = 'be2b9666-5c72-451e-98f4-efca76ffef54';
      await TEST_DATABASE_INSTANCE.t_starter_kit_order.update(ORDER_PAID, { account_id: accountId });
      await admin(request(TEST_BACKEND_APP).delete(`/admin/accounts/${accountId}`)).expect(200);
      const order = await TEST_DATABASE_INSTANCE.t_starter_kit_order.findOne({ id: ORDER_PAID });
      expect(order).to.include({ account_id: null, status: 'paid', ssh_password: 'ssh-password-paid' });
    });
  });

  describe('POST /admin/api/starter-kit/daily', () => {
    it('should send pickup point reminders and mark delivered parcels', async () => {
      process.env.MONDIAL_RELAY_ENSEIGNE = 'BDTEST13';
      process.env.MONDIAL_RELAY_PRIVATE_KEY = 'PrivateK';
      nock('https://api.mondialrelay.com')
        .post('/Web_Services.asmx', (body) => body.includes('<Expedition>12345678</Expedition>'))
        .reply(200, soapResponse('WSI2_TracingColisDetaille', '<STAT>82</STAT><Libelle01>Colis livré</Libelle01>'));
      const response = await request(TEST_BACKEND_APP)
        .post('/admin/api/starter-kit/daily')
        .set('Authorization', process.env.ADMIN_API_AUTHORIZATION_TOKEN)
        .expect(200);
      expect(response.body).to.deep.equal({ status: 200, reminded: [ORDER_PAID], delivered: [ORDER_SHIPPED] });
      expect(await getEmailEvents(ORDER_PAID)).to.deep.equal(['starter_kit_pickup_point_reminder']);
      expect(await getEmailEvents(ORDER_SHIPPED)).to.deep.equal(['starter_kit_delivered']);
      const paid = await TEST_DATABASE_INSTANCE.t_starter_kit_order.findOne({ id: ORDER_PAID });
      expect(paid.pickup_point_reminder_sent_at).to.not.equal(null);
      const shipped = await TEST_DATABASE_INSTANCE.t_starter_kit_order.findOne({ id: ORDER_SHIPPED });
      expect(shipped.status).to.equal('delivered');
    });

    it('should not remind twice and skip tracking when Mondial Relay is not configured', async () => {
      await request(TEST_BACKEND_APP)
        .post('/admin/api/starter-kit/daily')
        .set('Authorization', process.env.ADMIN_API_AUTHORIZATION_TOKEN)
        .expect(200);
      const response = await request(TEST_BACKEND_APP)
        .post('/admin/api/starter-kit/daily')
        .set('Authorization', process.env.ADMIN_API_AUTHORIZATION_TOKEN)
        .expect(200);
      expect(response.body).to.deep.equal({ status: 200, reminded: [], delivered: [] });
      expect(await getEmailEvents(ORDER_PAID)).to.deep.equal(['starter_kit_pickup_point_reminder']);
    });
  });
});
