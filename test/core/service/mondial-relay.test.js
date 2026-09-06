const { expect } = require('chai');
const nock = require('nock');
const { setupPersistentNocks } = require('../../tasks/nock');
const MondialRelayService = require('../../../core/service/mondial-relay');

const logger = { info() {}, warn() {}, debug() {} };

const soapResponse = (method, inner) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method}Response xmlns="http://www.mondialrelay.fr/webservice/"><${method}Result>${inner}</${method}Result></${method}Response></soap:Body></soap:Envelope>`;

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
    service = MondialRelayService(logger);
  });
  afterEach(() => {
    delete process.env.MONDIAL_RELAY_ENSEIGNE;
    delete process.env.MONDIAL_RELAY_PRIVATE_KEY;
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
    expect(service.sanitizePhone('+33 6 12 34 56 78')).to.equal('+33612345678');
    expect(service.sanitizePhone('06 12 34 56 78')).to.equal('0612345678');
    expect(service.sanitizePhone('not a phone')).to.equal('');
  });

  it('should not be configured without credentials', () => {
    delete process.env.MONDIAL_RELAY_ENSEIGNE;
    expect(service.isConfigured()).to.equal(false);
    expect(service.getWidgetBrandCode()).to.equal(null);
    return expect(service.createPickupPointShipment({})).to.be.rejectedWith('MONDIAL_RELAY_NOT_CONFIGURED');
  });

  it('should create a pickup point shipment and return the label', async () => {
    let requestBody;
    nock('https://api.mondialrelay.com')
      .post('/Web_Services.asmx', (body) => {
        requestBody = body;
        return true;
      })
      .reply(
        200,
        soapResponse(
          'WSI2_CreationEtiquette',
          '<STAT>0</STAT><ExpeditionNum>31234567</ExpeditionNum><URL_Etiquette>/ww2/PDF/label.aspx?ex=31234567</URL_Etiquette>',
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
      label_url: 'https://www.mondialrelay.com/ww2/PDF/label.aspx?ex=31234567',
      tracking_url: 'https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=31234567&codePostal=75011',
    });
    expect(requestBody).to.include('<Enseigne>BDTEST13</Enseigne>');
    expect(requestBody).to.include('<ModeCol>REL</ModeCol><ModeLiv>24R</ModeLiv>');
    expect(requestBody).to.include('<Dest_Ad1>PATRICE DUPONT</Dest_Ad1>');
    expect(requestBody).to.include('<Dest_Tel1>0612345678</Dest_Tel1>');
    expect(requestBody).to.include('<LIV_Rel_Pays>FR</LIV_Rel_Pays><LIV_Rel>012345</LIV_Rel>');
    expect(requestBody).to.include('<Poids>1500</Poids>');
    expect(requestBody).to.match(/<Security>[0-9A-F]{32}<\/Security>/);
  });

  it('should throw a readable error when Mondial Relay returns an error STAT', async () => {
    nock('https://api.mondialrelay.com')
      .post('/Web_Services.asmx')
      .reply(200, soapResponse('WSI2_CreationEtiquette', '<STAT>97</STAT>'));
    await expect(
      service.createPickupPointShipment({
        reference: 'ORDER-1',
        recipient: { name: 'A', address_1: 'B', postal_code: '75011', city: 'Paris' },
        pickupPoint: { id: '012345' },
      }),
    ).to.be.rejectedWith('STAT=97: Clé de sécurité invalide');
  });

  it('should get the tracking of a shipment and detect delivery', async () => {
    nock('https://api.mondialrelay.com')
      .post(
        '/Web_Services.asmx',
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

  it('should not report an in-transit shipment as delivered', async () => {
    nock('https://api.mondialrelay.com')
      .post('/Web_Services.asmx')
      .reply(200, soapResponse('WSI2_TracingColisDetaille', '<STAT>81</STAT><Libelle01>En cours</Libelle01>'));
    const tracking = await service.getTracking('31234567');
    expect(tracking.delivered).to.equal(false);
    expect(tracking.stat).to.equal('81');
  });

  it('should throw when the tracking returns an error STAT', async () => {
    nock('https://api.mondialrelay.com')
      .post('/Web_Services.asmx')
      .reply(200, soapResponse('WSI2_TracingColisDetaille', '<STAT>94</STAT>'));
    await expect(service.getTracking('00000000')).to.be.rejectedWith('Colis inexistant');
  });
});
