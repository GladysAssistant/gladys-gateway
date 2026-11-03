const { expect } = require('chai');
const nock = require('nock');
const { setupPersistentNocks } = require('../../tasks/nock');
const MondialRelayService = require('../../../core/service/mondial-relay');

const logger = { info() {}, warn() {}, debug() {} };

const soapResponse = (method, inner) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method}Response xmlns="http://www.mondialrelay.fr/webservice/"><${method}Result>${inner}</${method}Result></${method}Response></soap:Body></soap:Envelope>`;

const shipmentCreationResponse = (shipments, statuses = '') =>
  `<?xml version="1.0" encoding="utf-16"?><ShipmentCreationResponse xmlns="http://www.example.org/Response">` +
  `<ShipmentsList>${shipments}</ShipmentsList><StatusList>${statuses}</StatusList></ShipmentCreationResponse>`;

describe('MondialRelayService', () => {
  let service;
  beforeEach(() => {
    process.env.MONDIAL_RELAY_ENSEIGNE = 'BDTEST13';
    process.env.MONDIAL_RELAY_PRIVATE_KEY = 'PrivateK';
    process.env.MONDIAL_RELAY_SENDER_NAME = 'Gladys Assistant';
    process.env.MONDIAL_RELAY_SENDER_ADDRESS = '10 rue de la Paix';
    process.env.MONDIAL_RELAY_SENDER_POSTAL_CODE = '75002';
    process.env.MONDIAL_RELAY_SENDER_CITY = 'Paris';
    process.env.MONDIAL_RELAY_SENDER_PHONE = '+33612345678';
    process.env.MONDIAL_RELAY_SENDER_EMAIL = 'hello@gladysassistant.com';
    process.env.MONDIAL_RELAY_API2_LOGIN = 'BDTEST13@business-api.mondialrelay.com';
    process.env.MONDIAL_RELAY_API2_PASSWORD = 'api2password';
    service = MondialRelayService(logger);
  });
  afterEach(() => {
    delete process.env.MONDIAL_RELAY_ENSEIGNE;
    delete process.env.MONDIAL_RELAY_PRIVATE_KEY;
    delete process.env.MONDIAL_RELAY_API2_LOGIN;
    delete process.env.MONDIAL_RELAY_API2_PASSWORD;
    nock.cleanAll();
    setupPersistentNocks();
  });

  it('should compute the security hash (MD5 uppercase of params + private key)', () => {
    expect(service.computeSecurity(['BDTEST13', '12345678', 'FR'], 'PrivateK')).to.equal(
      '33DA5F122DAA40241087CC7845BEA4B1',
    );
  });

  it('should sanitize text and phone numbers for Mondial Relay', () => {
    expect(service.sanitizeText('Pierre-Gilles Leymarie, Ééà ç ü <script>')).to.equal(
      'PIERRE-GILLES LEYMARIE, EEA C U',
    );
    expect(service.sanitizeText('a'.repeat(50), 32)).to.have.lengthOf(32);
    expect(service.toInternationalPhone('+33 6 12 34 56 78', 'FR')).to.equal('+33612345678');
    expect(service.toInternationalPhone('06 12 34 56 78', 'FR')).to.equal('+33612345678');
    expect(service.toInternationalPhone('02 51 00 00 00', 'BE')).to.equal('+32251000000');
    expect(service.toInternationalPhone('not a phone', 'FR')).to.equal('');
    expect(service.toInternationalPhone('0612345678', 'ZZ')).to.equal('');
  });

  it('should split a street line into a house number and a street name', () => {
    expect(service.splitStreet('12 rue des Lilas')).to.deep.equal({ houseNo: '12', streetName: 'RUE DES LILAS' });
    expect(service.splitStreet('12 bis avenue de la Gare')).to.deep.equal({
      houseNo: '12BIS',
      streetName: 'AVENUE DE LA GARE',
    });
    expect(service.splitStreet('Lieu-dit Le Moulin')).to.deep.equal({
      houseNo: '',
      streetName: 'LIEU-DIT LE MOULIN',
    });
  });

  it('should sanitize postal codes according to the destination country', () => {
    expect(service.sanitizePostalCode('75011', 'FR')).to.equal('75011');
    expect(service.sanitizePostalCode(' 75 011 ', 'fr')).to.equal('75011');
    expect(service.sanitizePostalCode('1000', 'BE')).to.equal('1000');
    expect(service.sanitizePostalCode('1234 ab', 'NL')).to.equal('1234 AB');
    expect(service.sanitizePostalCode('1000-001', 'PT')).to.equal('1000-001');
    expect(service.sanitizePostalCode('SW1A 1AA', 'GB')).to.equal('SW1A 1AA');
    expect(service.sanitizePostalCode('75011')).to.equal('75011');
  });

  it('should not be configured without credentials', () => {
    delete process.env.MONDIAL_RELAY_ENSEIGNE;
    delete process.env.MONDIAL_RELAY_API2_LOGIN;
    expect(service.isConfigured()).to.equal(false);
    expect(service.isShipmentApiConfigured()).to.equal(false);
    expect(service.getWidgetBrandCode()).to.equal(null);
    return expect(service.createPickupPointShipment({})).to.be.rejectedWith('MONDIAL_RELAY_API2_NOT_CONFIGURED');
  });

  it('should create a pickup point shipment with API2 and return the label', async () => {
    let requestBody;
    nock('https://connect-api.mondialrelay.com')
      .post('/api/shipment', (body) => {
        requestBody = body;
        return true;
      })
      .reply(
        200,
        shipmentCreationResponse(
          '<Shipment ShipmentNumber="31234567"><LabelList><Label>' +
            '<Output>https://connect.mondialrelay.com/BDTEST13/etiquette/GetStickers?ex=31234567</Output>' +
            '</Label></LabelList></Shipment>',
        ),
      );
    const result = await service.createPickupPointShipment({
      reference: 'ORDER-1',
      recipient: {
        name: 'Patrice Dupont',
        address_1: '12 rue des Lilas',
        postal_code: '75011',
        city: 'Paris',
        country: 'fr',
        phone: '06 12 34 56 78',
        email: 'patrice@test.fr',
      },
      pickupPoint: { id: '012345', country: 'FR' },
    });
    expect(result).to.deep.equal({
      shipment_number: '31234567',
      label_url: 'https://connect.mondialrelay.com/BDTEST13/etiquette/GetStickers?ex=31234567',
      tracking_url: 'https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=31234567&codePostal=75011',
    });
    expect(requestBody).to.include('<Login>BDTEST13@business-api.mondialrelay.com</Login>');
    expect(requestBody).to.include('<Password>api2password</Password>');
    expect(requestBody).to.include('<CustomerId>BDTEST13</CustomerId>');
    expect(requestBody).to.include('<VersionAPI>1.0</VersionAPI>');
    expect(requestBody).to.include('<OutputType>PdfUrl</OutputType>');
    expect(requestBody).to.include('<DeliveryMode Mode="24R" Location="FR-012345"/>');
    expect(requestBody).to.include('<CollectionMode Mode="REL" Location=""/>');
    expect(requestBody).to.include('<Weight Value="1500" Unit="gr"/>');
    // The recipient name goes in AddressAdd1, the street is split in two fields
    expect(requestBody).to.include('<AddressAdd1>PATRICE DUPONT</AddressAdd1>');
    expect(requestBody).to.include('<Streetname>RUE DES LILAS</Streetname><HouseNo>12</HouseNo>');
    expect(requestBody).to.include('<PostCode>75011</PostCode>');
    expect(requestBody).to.include('<MobileNo>+33612345678</MobileNo>');
    expect(requestBody).to.include('<Email>patrice@test.fr</Email>');
    // No MD5 security hash on API2
    expect(requestBody).to.not.include('<Security>');
  });

  it('should throw a readable error when API2 rejects the shipment', async () => {
    nock('https://connect-api.mondialrelay.com')
      .post('/api/shipment')
      .reply(
        200,
        shipmentCreationResponse(
          '',
          '<Status Code="10001" Level="Critical Error" Message="Invalid user and/or password."/>',
        ),
      );
    await expect(
      service.createPickupPointShipment({
        reference: 'ORDER-1',
        recipient: { name: 'A', address_1: '1 rue B', postal_code: '75011', city: 'Paris' },
        pickupPoint: { id: '012345' },
      }),
    ).to.be.rejectedWith('STAT=10001: 10001 Invalid user and/or password.');
  });

  it('should ignore API2 warnings and still return the shipment', async () => {
    nock('https://connect-api.mondialrelay.com')
      .post('/api/shipment')
      .reply(
        200,
        shipmentCreationResponse(
          '<Shipment ShipmentNumber="31234568"><LabelList><Label><Output>https://label</Output></Label></LabelList></Shipment>',
          '<Status Code="10053" Level="Warning" Message="Invalid email defined in the address."/>',
        ),
      );
    const result = await service.createPickupPointShipment({
      reference: 'ORDER-2',
      recipient: { name: 'A', address_1: '1 rue B', postal_code: '75011', city: 'Paris' },
      pickupPoint: { id: '012345' },
    });
    expect(result.shipment_number).to.equal('31234568');
    expect(result.label_url).to.equal('https://label');
  });

  it('should use the API2 sandbox when asked to', async () => {
    process.env.MONDIAL_RELAY_API2_SANDBOX = 'true';
    nock('https://connect-api-sandbox.mondialrelay.com')
      .post('/api/shipment')
      .reply(
        200,
        shipmentCreationResponse(
          '<Shipment ShipmentNumber="31234569"><LabelList><Label><Output>https://label</Output></Label></LabelList></Shipment>',
        ),
      );
    const result = await service.createPickupPointShipment({
      reference: 'ORDER-3',
      recipient: { name: 'A', address_1: '1 rue B', postal_code: '75011', city: 'Paris' },
      pickupPoint: { id: '012345' },
    });
    expect(result.shipment_number).to.equal('31234569');
    delete process.env.MONDIAL_RELAY_API2_SANDBOX;
  });

  it('should check the API2 credentials without creating a shipment', async () => {
    let requestBody;
    nock('https://connect-api.mondialrelay.com')
      .post('/api/shipment', (body) => {
        requestBody = body;
        return true;
      })
      .reply(
        200,
        shipmentCreationResponse(
          '',
          '<Status Code="10011" Level="Error" Message="No shipment entity defined in the request."/>',
        ),
      );
    const result = await service.checkShipmentApiCredentials();
    expect(result.ok).to.equal(true);
    expect(result.code).to.equal('10011');
    expect(requestBody).to.include('<ShipmentsList/>');
  });

  it('should report invalid API2 credentials', async () => {
    nock('https://connect-api.mondialrelay.com')
      .post('/api/shipment')
      .reply(
        200,
        shipmentCreationResponse(
          '',
          '<Status Code="10001" Level="Critical Error" Message="Invalid user and/or password."/>',
        ),
      );
    const result = await service.checkShipmentApiCredentials();
    expect(result.ok).to.equal(false);
    expect(result.code).to.equal('10001');
  });

  it('should get the tracking of a shipment and detect delivery', async () => {
    nock('https://api.mondialrelay.com')
      .post(
        '/WebService.asmx',
        (body) => body.includes('<WSI2_TracingColisDetaille') && body.includes('<Langue>FR</Langue>'),
      )
      .reply(
        200,
        soapResponse(
          'WSI2_TracingColisDetaille',
          '<STAT>82</STAT><Libelle01>Colis livré</Libelle01><Relais_Libelle>TABAC DE LA GARE</Relais_Libelle><Relais_Num>012345</Relais_Num>' +
            '<Tracing><ret_WSI2_sub_TracingColisDetaille><Libelle>Colis livré</Libelle><Date>06/09/2026</Date><Heure>10:12</Heure><Emplacement>LYON</Emplacement></ret_WSI2_sub_TracingColisDetaille></Tracing>',
        ),
      );
    const tracking = await service.getTracking('31234567', 'fr');
    expect(tracking.delivered).to.equal(true);
    expect(tracking.status).to.equal('Colis livré');
    expect(tracking.pickup_point_name).to.equal('TABAC DE LA GARE');
    expect(tracking.events).to.deep.equal([
      { label: 'Colis livré', date: '06/09/2026', time: '10:12', location: 'LYON' },
    ]);
  });

  it('should not report an in-transit shipment as delivered and ask English tracking with GB', async () => {
    nock('https://api.mondialrelay.com')
      .post('/WebService.asmx', (body) => body.includes('<Langue>GB</Langue>'))
      .reply(200, soapResponse('WSI2_TracingColisDetaille', '<STAT>81</STAT><Libelle01>In progress</Libelle01>'));
    const tracking = await service.getTracking('31234567', 'en');
    expect(tracking.delivered).to.equal(false);
    expect(tracking.stat).to.equal('81');
  });

  it('should throw when the tracking returns an error STAT', async () => {
    nock('https://api.mondialrelay.com')
      .post('/WebService.asmx')
      .reply(200, soapResponse('WSI2_TracingColisDetaille', '<STAT>94</STAT>'));
    await expect(service.getTracking('00000000')).to.be.rejectedWith('Colis inexistant');
  });
});
