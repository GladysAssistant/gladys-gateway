const crypto = require('crypto');
const axios = require('axios');

// Mondial Relay exposes two different APIs (technical documentation V1.2, February 2026):
//
// - API1, SOAP, https://api.mondialrelay.com/WebService.asmx: pickup point search and parcel
//   tracing. Secured by an MD5 hash of the parameters and of the "clé privée" of the account.
//   Its shipment creation methods (WSI2_CreationEtiquette) are no longer maintained by Mondial
//   Relay and must not be used.
// - API2 ("dual carrier"), REST/XML, https://connect-api.mondialrelay.com/api/shipment: creates
//   the shipments and their labels. It has its own credentials (login, password, customer id),
//   generated in Connect under "Administration" > "Configuration des API" > "API Version V2.0".
//
// So this service tracks parcels with API1 and creates shipments with API2.
const DEFAULT_API_URL = 'https://api.mondialrelay.com/WebService.asmx';
const SOAP_NAMESPACE = 'http://www.mondialrelay.fr/webservice/';
const DEFAULT_SHIPMENT_API_URL = 'https://connect-api.mondialrelay.com/api/shipment';
const SANDBOX_SHIPMENT_API_URL = 'https://connect-api-sandbox.mondialrelay.com/api/shipment';
const SHIPMENT_API_VERSION = '1.0';
const DEFAULT_LABEL_FORMAT = '10x15';
const DEFAULT_CULTURE = 'fr-FR';
const PUBLIC_TRACKING_URL = 'https://www.mondialrelay.fr/suivi-de-colis/';

// Delivery in a pickup point ("Point Relais")
const DELIVERY_MODE_PICKUP_POINT = '24R';
// Collect mode: the parcel is dropped by the sender in a pickup point ("REL"),
// or collected at the sender's place ("CCC")
const DEFAULT_COLLECT_MODE = 'REL';
const DEFAULT_WEIGHT_IN_GRAMS = 1500;

// Tracking status codes returned by WSI2_TracingColisDetaille
const TRACING_STAT = {
  REGISTERED: '80',
  IN_TRANSIT: '81',
  DELIVERED: '82',
  ANOMALY: '83',
};

const STAT_MESSAGES = {
  0: 'OK',
  1: 'Enseigne invalide',
  2: "Numéro d'enseigne vide ou inexistant",
  3: 'Numéro de compte enseigne invalide',
  8: 'Mode de collecte ou de livraison invalide',
  9: 'Mode de collecte ou de livraison invalide',
  10: 'Type de collecte invalide',
  11: 'Numéro de Relais de Collecte invalide',
  12: 'Pays de Relais de collecte invalide',
  13: 'Type de livraison invalide',
  14: 'Numéro de Relais de livraison invalide',
  15: 'Pays de Relais de livraison invalide',
  20: 'Poids du colis invalide',
  21: 'Taille (Longueur + Hauteur) du colis invalide',
  22: 'Taille du colis invalide',
  24: "Numéro d'expédition ou de suivi invalide",
  26: 'Temps de montage invalide',
  27: 'Mode de collecte ou de livraison invalide',
  28: 'Mode de collecte invalide',
  29: 'Mode de livraison invalide',
  30: 'Adresse (L1) invalide',
  31: 'Adresse (L2) invalide',
  33: 'Adresse (L3) invalide',
  34: 'Adresse (L4) invalide',
  35: 'Ville invalide',
  36: 'Code postal invalide',
  37: 'Pays invalide',
  38: 'Numéro de téléphone invalide',
  39: 'Adresse e-mail invalide',
  40: 'Paramètres manquants',
  42: 'Montant CRT invalide',
  43: 'Devise CRT invalide',
  44: 'Valeur du colis invalide',
  45: 'Devise de la valeur du colis invalide',
  46: "Plage de numéro d'expédition épuisée",
  47: 'Nombre de colis invalide',
  48: 'Multi-Colis Relais Interdit',
  49: 'Action invalide',
  60: 'Champ texte libre invalide',
  61: 'Top avisage invalide',
  62: 'Instruction de livraison invalide',
  63: 'Assurance invalide',
  64: 'Temps de montage invalide',
  65: 'Top rendez-vous invalide',
  66: 'Top reprise invalide',
  67: 'Latitude invalide',
  68: 'Longitude invalide',
  69: 'Code Enseigne invalide',
  70: 'Numéro de Point Relais invalide',
  71: 'Nature de point de vente non valide',
  74: 'Langue invalide',
  78: 'Pays de Collecte invalide',
  79: 'Pays de Livraison invalide',
  80: 'Colis enregistré',
  81: 'Colis en traitement chez Mondial Relay',
  82: 'Colis livré',
  83: 'Anomalie',
  92: 'Le code pays du destinataire et le code pays du Point Relais doivent être identiques, ou solde insuffisant',
  93: 'Aucun élément retourné par le plan de tri',
  94: 'Colis inexistant',
  95: 'Compte Enseigne non activé',
  96: "Type d'enseigne incorrect en base",
  97: 'Clé de sécurité invalide',
  98: 'Erreur générique (paramètres invalides)',
  99: 'Erreur générique du service',
};

const TRACKING_PARAMS = ['Enseigne', 'Expedition', 'Langue'];

// API2 error codes that mean the credentials or the account configuration are wrong, as
// opposed to a problem with the shipment itself (see "ERROR CODES" of the documentation).
const SHIPMENT_API_CREDENTIAL_ERRORS = ['10000', '10001', '10002', '10003', '10004', '10005', '10006', '10007'];
const SHIPMENT_API_ACCESS_ERRORS = ['10066', '10067'];

class MondialRelayError extends Error {
  // `stat` is the STAT code for API1, the error code of the StatusList for API2. `statMessage`
  // is given by API2 in the language of the request, and looked up in STAT_MESSAGES for API1.
  constructor(stat, method, statMessage) {
    const message = statMessage || STAT_MESSAGES[stat] || 'Erreur inconnue';
    super(`Mondial Relay ${method} failed with STAT=${stat}: ${message}`);
    this.stat = stat;
    this.statMessage = message;
    this.method = method;
  }
}

// Mondial Relay only accepts a restricted latin charset in address fields:
// strip accents, uppercase, remove unsupported characters and truncate.
function sanitizeText(value, maxLength = 32) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^0-9A-Z_\-'&,./ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

// Postal code formats accepted by Mondial Relay per country (technical documentation):
// characters kept and maximum length. Unknown countries keep letters, digits, spaces and
// dashes, which covers the remaining european formats.
const POSTAL_CODE_FORMATS = {
  FR: { allowed: /[^0-9]/g, maxLength: 5 },
  ES: { allowed: /[^0-9]/g, maxLength: 5 },
  IT: { allowed: /[^0-9]/g, maxLength: 5 },
  DE: { allowed: /[^0-9]/g, maxLength: 5 },
  BE: { allowed: /[^0-9]/g, maxLength: 4 },
  LU: { allowed: /[^0-9]/g, maxLength: 4 },
  AT: { allowed: /[^0-9]/g, maxLength: 4 },
  CH: { allowed: /[^0-9]/g, maxLength: 4 },
  NL: { allowed: /[^0-9A-Z ]/g, maxLength: 7 },
  PT: { allowed: /[^0-9-]/g, maxLength: 8 },
};
const DEFAULT_POSTAL_CODE_FORMAT = { allowed: /[^0-9A-Z -]/g, maxLength: 10 };

function sanitizePostalCode(value, country = 'FR') {
  const format = POSTAL_CODE_FORMATS[String(country || 'FR').toUpperCase()] || DEFAULT_POSTAL_CODE_FORMAT;
  return String(value || '')
    .toUpperCase()
    .replace(format.allowed, '')
    .trim()
    .slice(0, format.maxLength);
}

// Language codes of the Web Service are not ISO 639-1: English is "GB"
const TRACKING_LANGUAGES = { fr: 'FR', en: 'GB' };

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractTag(xml, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? decodeXml(match[1].trim()) : null;
}

// Attributes of every `<tag ...>` element of an XML document, as plain objects.
function extractElementAttributes(xml, tag) {
  const elements = [];
  const elementRegex = new RegExp(`<${tag}\\b([^>]*?)/?>`, 'g');
  let element = elementRegex.exec(xml);
  while (element !== null) {
    const attributes = {};
    const attributeRegex = /([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g;
    let attribute = attributeRegex.exec(element[1]);
    while (attribute !== null) {
      attributes[attribute[1]] = decodeXml(attribute[2]);
      attribute = attributeRegex.exec(element[1]);
    }
    elements.push(attributes);
    element = elementRegex.exec(xml);
  }
  return elements;
}

// International dialling codes of the countries served by Mondial Relay. API2 wants the phone
// numbers in international format ("+33320202020"), while customers usually type a national one.
const DIALLING_CODES = {
  FR: '33',
  BE: '32',
  LU: '352',
  NL: '31',
  ES: '34',
  PT: '351',
  IT: '39',
  DE: '49',
  AT: '43',
  CH: '41',
  GB: '44',
  IE: '353',
  PL: '48',
};

// Phone number in the international format expected by API2, or an empty string when the
// number cannot be converted: the field is optional for a pickup point delivery.
function toInternationalPhone(value, country = 'FR') {
  if (!value) {
    return '';
  }
  const phone = String(value).replace(/[^0-9+]/g, '');
  if (phone.startsWith('+')) {
    return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : '';
  }
  const diallingCode = DIALLING_CODES[String(country || 'FR').toUpperCase()];
  if (!diallingCode) {
    return '';
  }
  // National format: a single leading zero is the national prefix and is dropped
  const nationalNumber = phone.replace(/^0+/, '');
  if (!/^[1-9]\d{5,13}$/.test(nationalNumber)) {
    return '';
  }
  return `+${diallingCode}${nationalNumber}`;
}

// API2 wants the house number and the street name in two separate fields, while an address is
// usually stored as one line. A leading number (with its "bis"/"ter"/letter suffix) is the house
// number in the countries served here; the rest is the street name.
function splitStreet(addressLine) {
  const address = sanitizeText(addressLine, 60);
  const match = /^(\d+\s*(?:BIS|TER|QUATER|[A-Z])?)\s+(.+)$/.exec(address);
  if (!match) {
    return { houseNo: '', streetName: address.slice(0, 40) };
  }
  return {
    houseNo: match[1].replace(/\s+/g, '').slice(0, 10),
    streetName: match[2].slice(0, 40),
  };
}

function extractBlocks(xml, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  const blocks = [];
  let match = regex.exec(xml);
  while (match !== null) {
    blocks.push(match[1]);
    match = regex.exec(xml);
  }
  return blocks;
}

function computeSecurity(values, privateKey) {
  return crypto
    .createHash('md5')
    .update(`${values.join('')}${privateKey}`, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function buildEnvelope(method, params) {
  const body = Object.keys(params)
    .map((key) => `<${key}>${escapeXml(params[key])}</${key}>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soap:Body><${method} xmlns="${SOAP_NAMESPACE}">${body}</${method}></soap:Body></soap:Envelope>`
  );
}

function getPublicTrackingUrl(shipmentNumber, postalCode) {
  const url = `${PUBLIC_TRACKING_URL}?numeroExpedition=${encodeURIComponent(shipmentNumber)}`;
  if (postalCode) {
    return `${url}&codePostal=${encodeURIComponent(postalCode)}`;
  }
  return url;
}

// Sandbox environment of API2, enabled with MONDIAL_RELAY_API2_SANDBOX=true. The shipments it
// creates are not real: the labels carry a "ModeSandbox" flag and no parcel is ever collected.
function getShipmentApiUrl() {
  if (process.env.MONDIAL_RELAY_API2_URL) {
    return process.env.MONDIAL_RELAY_API2_URL;
  }
  return process.env.MONDIAL_RELAY_API2_SANDBOX === 'true' ? SANDBOX_SHIPMENT_API_URL : DEFAULT_SHIPMENT_API_URL;
}

module.exports = function MondialRelayService(logger) {
  // Read at call time so the credentials can be rotated without a code change (and toggled in tests)
  function getConfig() {
    const enseigne = process.env.MONDIAL_RELAY_ENSEIGNE;
    return {
      enseigne,
      privateKey: process.env.MONDIAL_RELAY_PRIVATE_KEY,
      apiUrl: process.env.MONDIAL_RELAY_API_URL || DEFAULT_API_URL,
      shipmentApi: {
        url: getShipmentApiUrl(),
        login: process.env.MONDIAL_RELAY_API2_LOGIN,
        password: process.env.MONDIAL_RELAY_API2_PASSWORD,
        // The customer id of API2 is the code enseigne, unless Mondial Relay gave another one
        customerId: process.env.MONDIAL_RELAY_API2_CUSTOMER_ID || enseigne,
        culture: process.env.MONDIAL_RELAY_API2_CULTURE || DEFAULT_CULTURE,
        labelFormat: process.env.MONDIAL_RELAY_LABEL_FORMAT || DEFAULT_LABEL_FORMAT,
      },
    };
  }

  // API1 (tracing) is configured
  function isConfigured() {
    const { enseigne, privateKey } = getConfig();
    return Boolean(enseigne && privateKey);
  }

  // API2 (shipment and label creation) is configured
  function isShipmentApiConfigured() {
    const { login, password, customerId } = getConfig().shipmentApi;
    return Boolean(login && password && customerId);
  }

  // "Brand" parameter of the Mondial Relay pickup point widget on the website: the code
  // enseigne (8 characters), unless Mondial Relay provided a dedicated widget code
  function getWidgetBrandCode() {
    return process.env.MONDIAL_RELAY_BRAND_CODE || getConfig().enseigne || null;
  }

  async function call(method, orderedKeys, values) {
    const { privateKey, apiUrl } = getConfig();
    const params = {};
    orderedKeys.forEach((key) => {
      params[key] = values[key] === undefined || values[key] === null ? '' : String(values[key]);
    });
    params.Security = computeSecurity(
      orderedKeys.map((key) => params[key]),
      privateKey,
    );
    const xml = buildEnvelope(method, params);
    const response = await axios.post(apiUrl, xml, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `${SOAP_NAMESPACE}${method}`,
      },
      timeout: 20 * 1000,
      responseType: 'text',
    });
    const stat = extractTag(response.data, 'STAT');
    return { stat, xml: response.data };
  }

  function getSender() {
    return {
      name: process.env.MONDIAL_RELAY_SENDER_NAME,
      address_1: process.env.MONDIAL_RELAY_SENDER_ADDRESS,
      address_2: process.env.MONDIAL_RELAY_SENDER_ADDRESS_2,
      postal_code: process.env.MONDIAL_RELAY_SENDER_POSTAL_CODE,
      city: process.env.MONDIAL_RELAY_SENDER_CITY,
      country: process.env.MONDIAL_RELAY_SENDER_COUNTRY || 'FR',
      phone: process.env.MONDIAL_RELAY_SENDER_PHONE,
      email: process.env.MONDIAL_RELAY_SENDER_EMAIL,
    };
  }

  // One <Address> block of the API2 request. Mondial Relay prints the label as
  // "[AddressAdd1] / [AddressAdd2] / [HouseNo] [StreetName] / [AddressAdd3] / [PostCode] [City]",
  // so the name goes in AddressAdd1 and the address complement in AddressAdd3.
  function buildAddressXml(tag, address) {
    const country = (address.country || 'FR').toUpperCase();
    const { houseNo, streetName } = splitStreet(address.address_1);
    const fields = {
      Title: '',
      Firstname: '',
      Lastname: '',
      Streetname: streetName,
      HouseNo: houseNo,
      CountryCode: country,
      PostCode: sanitizePostalCode(address.postal_code, country),
      City: sanitizeText(address.city, 30),
      AddressAdd1: sanitizeText(address.name, 30),
      AddressAdd2: '',
      AddressAdd3: sanitizeText(address.address_2, 30),
      PhoneNo: '',
      MobileNo: toInternationalPhone(address.phone, country),
      Email: address.email || '',
    };
    const body = Object.keys(fields)
      .map((key) => `<${key}>${escapeXml(fields[key])}</${key}>`)
      .join('');
    return `<${tag}><Address>${body}</Address></${tag}>`;
  }

  function buildShipmentCreationRequest({ reference, sender, recipient, pickupPoint, weightInGrams }) {
    const { shipmentApi } = getConfig();
    const context = [
      '<Context>',
      `<Login>${escapeXml(shipmentApi.login)}</Login>`,
      `<Password>${escapeXml(shipmentApi.password)}</Password>`,
      `<CustomerId>${escapeXml(shipmentApi.customerId)}</CustomerId>`,
      `<Culture>${escapeXml(shipmentApi.culture)}</Culture>`,
      `<VersionAPI>${SHIPMENT_API_VERSION}</VersionAPI>`,
      '</Context>',
    ].join('');
    const outputOptions = [
      '<OutputOptions>',
      `<OutputFormat>${escapeXml(shipmentApi.labelFormat)}</OutputFormat>`,
      '<OutputType>PdfUrl</OutputType>',
      '</OutputOptions>',
    ].join('');
    // The delivery location of a pickup point delivery is "<country>-<pickup point id>"
    const deliveryLocation = `${(pickupPoint.country || 'FR').toUpperCase()}-${pickupPoint.id}`;
    const collectionMode = process.env.MONDIAL_RELAY_COLLECT_MODE || DEFAULT_COLLECT_MODE;
    const collectionLocation = process.env.MONDIAL_RELAY_COLLECT_POINT_ID || '';
    const shipment = [
      '<Shipment>',
      `<OrderNo>${escapeXml(reference)}</OrderNo>`,
      '<CustomerNo/>',
      '<ParcelCount>1</ParcelCount>',
      `<DeliveryMode Mode="${DELIVERY_MODE_PICKUP_POINT}" Location="${escapeXml(deliveryLocation)}"/>`,
      `<CollectionMode Mode="${escapeXml(collectionMode)}" Location="${escapeXml(collectionLocation)}"/>`,
      `<Parcels><Parcel><Weight Value="${weightInGrams}" Unit="gr"/></Parcel></Parcels>`,
      buildAddressXml('Sender', sender),
      buildAddressXml('Recipient', recipient),
      '</Shipment>',
    ].join('');
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<ShipmentCreationRequest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ',
      'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="http://www.example.org/Request">',
      context,
      outputOptions,
      `<ShipmentsList>${shipment}</ShipmentsList>`,
      '</ShipmentCreationRequest>',
    ].join('');
  }

  // POST an already built XML request to API2 and return the raw response.
  async function callShipmentApi(xml) {
    const { shipmentApi } = getConfig();
    const response = await axios.post(shipmentApi.url, xml, {
      headers: {
        Accept: 'application/xml',
        'Content-Type': 'text/xml',
      },
      timeout: 30 * 1000,
      responseType: 'text',
    });
    return response.data;
  }

  // Business errors of an API2 response. Warnings are logged but do not fail the call: they
  // report optional fields that were ignored, the shipment is created anyway.
  function getShipmentApiErrors(xml) {
    const statuses = extractElementAttributes(xml, 'Status');
    const errors = [];
    statuses.forEach((status) => {
      const level = String(status.Level || '');
      const message = status.Message || '';
      if (level.toLowerCase() === 'warning') {
        logger.warn(`Mondial Relay: shipment creation warning ${status.Code}: ${message}`);
        return;
      }
      errors.push({ code: String(status.Code || ''), level, message });
    });
    return errors;
  }

  /**
   * Create a shipment to a pickup point and return its tracking number and label.
   * Uses API2 ("dual carrier"), the only supported way to create a shipment.
   *
   * @param {Object} shipment
   * @param {string} shipment.reference - Merchant reference (max 15 chars)
   * @param {Object} shipment.recipient - { name, address_1, address_2, postal_code, city, country, phone, email }
   * @param {Object} shipment.pickupPoint - { id, country }
   * @param {number} [shipment.weightInGrams]
   * @returns {Promise<{ shipment_number: string, label_url: string, tracking_url: string }>}
   */
  async function createPickupPointShipment(shipment) {
    if (!isShipmentApiConfigured()) {
      throw new Error('MONDIAL_RELAY_API2_NOT_CONFIGURED');
    }
    const sender = getSender();
    const { recipient, pickupPoint } = shipment;
    const weightInGrams = Number(
      shipment.weightInGrams || process.env.MONDIAL_RELAY_PARCEL_WEIGHT_IN_GRAMS || DEFAULT_WEIGHT_IN_GRAMS,
    );
    const reference = sanitizeText(shipment.reference, 15);
    logger.info(`Mondial Relay: creating shipment ${reference} to pickup point ${pickupPoint.id}`);
    const xml = await callShipmentApi(
      buildShipmentCreationRequest({ reference, sender, recipient, pickupPoint, weightInGrams }),
    );

    const errors = getShipmentApiErrors(xml);
    if (errors.length > 0) {
      const [firstError] = errors;
      throw new MondialRelayError(
        firstError.code,
        'ShipmentCreationRequest',
        errors.map((error) => `${error.code} ${error.message}`).join(' / '),
      );
    }
    const [createdShipment] = extractElementAttributes(xml, 'Shipment');
    const shipmentNumber = createdShipment && createdShipment.ShipmentNumber;
    if (!shipmentNumber) {
      throw new MondialRelayError('', 'ShipmentCreationRequest', 'No shipment number in the response');
    }
    logger.info(`Mondial Relay: shipment ${shipmentNumber} created`);
    return {
      shipment_number: shipmentNumber,
      label_url: extractTag(xml, 'Output') || '',
      tracking_url: getPublicTrackingUrl(shipmentNumber, sanitizePostalCode(recipient.postal_code, recipient.country)),
    };
  }

  /**
   * Check the API2 credentials without creating anything, by sending a request with no shipment
   * in it: valid credentials answer with the business error 10011 (no shipment entity defined),
   * wrong ones with an authentication error.
   *
   * @returns {Promise<{ ok: boolean, code: string, message: string }>}
   */
  async function checkShipmentApiCredentials() {
    if (!isShipmentApiConfigured()) {
      throw new Error('MONDIAL_RELAY_API2_NOT_CONFIGURED');
    }
    const { shipmentApi } = getConfig();
    const xml = await callShipmentApi(
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<ShipmentCreationRequest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ',
        'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="http://www.example.org/Request">',
        '<Context>',
        `<Login>${escapeXml(shipmentApi.login)}</Login>`,
        `<Password>${escapeXml(shipmentApi.password)}</Password>`,
        `<CustomerId>${escapeXml(shipmentApi.customerId)}</CustomerId>`,
        `<Culture>${escapeXml(shipmentApi.culture)}</Culture>`,
        `<VersionAPI>${SHIPMENT_API_VERSION}</VersionAPI>`,
        '</Context>',
        `<OutputOptions><OutputFormat>${escapeXml(shipmentApi.labelFormat)}</OutputFormat>`,
        '<OutputType>PdfUrl</OutputType></OutputOptions>',
        '<ShipmentsList/>',
        '</ShipmentCreationRequest>',
      ].join(''),
    );
    const statuses = extractElementAttributes(xml, 'Status');
    const blocking = statuses.find(
      (status) =>
        SHIPMENT_API_CREDENTIAL_ERRORS.includes(String(status.Code)) ||
        SHIPMENT_API_ACCESS_ERRORS.includes(String(status.Code)),
    );
    if (blocking) {
      return { ok: false, code: String(blocking.Code), message: blocking.Message || '' };
    }
    const [status] = statuses;
    return {
      ok: true,
      code: status ? String(status.Code) : '',
      message: status ? status.Message || '' : '',
    };
  }

  /**
   * Get the tracking status of a shipment.
   *
   * @returns {Promise<{ stat: string, status: string, delivered: boolean, events: Array }>}
   */
  async function getTracking(shipmentNumber, language = 'fr') {
    if (!isConfigured()) {
      throw new Error('MONDIAL_RELAY_NOT_CONFIGURED');
    }
    const values = {
      Enseigne: getConfig().enseigne,
      Expedition: shipmentNumber,
      Langue: TRACKING_LANGUAGES[String(language || 'fr').toLowerCase()] || 'FR',
    };
    const { stat, xml } = await call('WSI2_TracingColisDetaille', TRACKING_PARAMS, values);
    if (!Object.values(TRACING_STAT).includes(stat)) {
      throw new MondialRelayError(stat, 'WSI2_TracingColisDetaille');
    }
    const events = extractBlocks(xml, 'ret_WSI2_sub_TracingColisDetaille').map((block) => ({
      label: extractTag(block, 'Libelle'),
      date: extractTag(block, 'Date'),
      time: extractTag(block, 'Heure'),
      location: extractTag(block, 'Emplacement'),
    }));
    const status = extractTag(xml, 'Libelle01') || STAT_MESSAGES[stat];
    return {
      stat,
      status,
      delivered: stat === TRACING_STAT.DELIVERED,
      pickup_point_name: extractTag(xml, 'Relais_Libelle'),
      pickup_point_id: extractTag(xml, 'Relais_Num'),
      events,
    };
  }

  return {
    isConfigured,
    isShipmentApiConfigured,
    getWidgetBrandCode,
    createPickupPointShipment,
    checkShipmentApiCredentials,
    getTracking,
    getPublicTrackingUrl,
    MondialRelayError,
    // exported for tests
    computeSecurity,
    sanitizeText,
    sanitizePostalCode,
    toInternationalPhone,
    splitStreet,
  };
};

module.exports.MondialRelayError = MondialRelayError;
module.exports.TRACING_STAT = TRACING_STAT;
module.exports.getPublicTrackingUrl = getPublicTrackingUrl;
