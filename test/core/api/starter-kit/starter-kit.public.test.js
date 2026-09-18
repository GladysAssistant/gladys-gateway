const request = require('supertest');
const { expect } = require('chai');

describe('GET /starter-kit/orders/:token', () => {
  beforeEach(() => {
    process.env.STARTER_KIT_TRAINING_URL = 'https://formation.gladysassistant.com/order';
    process.env.STARTER_KIT_TRAINING_CODE = 'GLADYS2026';
    process.env.MONDIAL_RELAY_BRAND_CODE = 'BDTEST';
  });
  afterEach(() => {
    delete process.env.MONDIAL_RELAY_BRAND_CODE;
  });

  it('should return the public view of the order', async () => {
    const response = await request(TEST_BACKEND_APP)
      .get('/starter-kit/orders/token-paid')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(response.body).to.include({
      id: '5f0c5a2a-6a0b-4b53-9c3a-0a0d2e3f4a01',
      status: 'paid',
      status_label: 'Commande confirmée',
      language: 'fr',
      customer_first_name: 'Patrice',
      can_select_pickup_point: true,
      pickup_point: null,
      shipment_number: null,
      ssh: null,
    });
    expect(response.body.status_history).to.have.lengthOf(1);
    expect(response.body.status_history[0]).to.include({ status: 'paid', label: 'Commande confirmée' });
    expect(response.body.training).to.deep.equal({
      url: 'https://formation.gladysassistant.com/order',
      code: 'GLADYS2026',
    });
    expect(response.body.mondial_relay).to.deep.equal({
      widget_brand_code: 'BDTEST',
      country: 'FR',
      postal_code: '75011',
    });
    // No private data on the public page
    expect(response.body).to.not.have.property('email');
    expect(response.body).to.not.have.property('shipping_address');
    expect(response.body).to.not.have.property('ssh_password');
    expect(response.body).to.not.have.property('notes');
    expect(response.body).to.not.have.property('stripe_customer_id');
  });

  it('should expose SSH credentials and tracking url once shipped', async () => {
    const response = await request(TEST_BACKEND_APP).get('/starter-kit/orders/token-shipped').expect(200);
    expect(response.body).to.include({
      status: 'shipped',
      shipment_number: '12345678',
      can_select_pickup_point: false,
    });
    expect(response.body.shipment_tracking_url).to.equal(
      'https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=12345678&codePostal=33000',
    );
    expect(response.body.ssh).to.deep.equal({ username: 'gladys', password: 'ssh-password-shipped' });
    expect(response.body.pickup_point).to.have.property('name', 'SUPERETTE DU CENTRE');
  });

  it('should return 404 with an unknown token', async () => {
    await request(TEST_BACKEND_APP).get('/starter-kit/orders/unknown-token').expect(404);
  });
});

describe('POST /starter-kit/orders/:token/pickup-point', () => {
  it('should save the pickup point selected by the customer', async () => {
    const response = await request(TEST_BACKEND_APP)
      .post('/starter-kit/orders/token-paid/pickup-point')
      .send({
        id: '098765',
        name: 'Boulangerie Paul',
        address_1: '3 rue de Paris',
        address_2: '',
        postal_code: '75011',
        city: 'Paris',
        country: 'FR',
        extra_field: 'ignored',
      })
      .expect(200);
    expect(response.body.pickup_point).to.deep.equal({
      id: '098765',
      name: 'Boulangerie Paul',
      address_1: '3 rue de Paris',
      address_2: '',
      postal_code: '75011',
      city: 'Paris',
      country: 'FR',
    });
    expect(response.body.pickup_point_selected_at).to.not.equal(null);
    const events = await TEST_DATABASE_INSTANCE.t_starter_kit_order_event.find({
      order_id: '5f0c5a2a-6a0b-4b53-9c3a-0a0d2e3f4a01',
      type: 'pickup_point_selected',
    });
    expect(events).to.have.lengthOf(1);
  });

  it('should reject an invalid pickup point', async () => {
    await request(TEST_BACKEND_APP)
      .post('/starter-kit/orders/token-paid/pickup-point')
      .send({ id: 'not valid !', name: 'X' })
      .expect(422);
  });

  it('should refuse to change the pickup point once the parcel is shipped', async () => {
    await request(TEST_BACKEND_APP)
      .post('/starter-kit/orders/token-shipped/pickup-point')
      .send({ id: '098765', name: 'Boulangerie Paul', postal_code: '75011', city: 'Paris', country: 'FR' })
      .expect(403);
  });

  it('should return 404 with an unknown token', async () => {
    await request(TEST_BACKEND_APP)
      .post('/starter-kit/orders/unknown/pickup-point')
      .send({ id: '098765', name: 'Boulangerie Paul' })
      .expect(404);
  });
});
