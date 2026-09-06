const crypto = require('crypto');
const axios = require('axios');

// Mondial Relay "Web Service" (SOAP, v5): https://api.mondialrelay.com/Web_Services.asmx
// Credentials (code enseigne + clé privée) are found in the Mondial Relay Connect Pro
// account, under "Mon profil" > "Mes paramètres de connexion".
const DEFAULT_API_URL = 'https://api.mondialrelay.com/Web_Services.asmx';
const SOAP_NAMESPACE = 'http://www.mondialrelay.fr/webservice/';
const LABEL_BASE_URL = 'https://www.mondialrelay.com';
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

// Ordered parameters of WSI2_CreationEtiquette (order matters for the security hash)
const CREATE_LABEL_PARAMS = [
  'Enseigne',
  'ModeCol',
  'ModeLiv',
  'NDossier',
  'NClient',
  'Expe_Langage',
  'Expe_Ad1',
  'Expe_Ad2',
  'Expe_Ad3',
  'Expe_Ad4',
  'Expe_Ville',
  'Expe_CP',
  'Expe_Pays',
  'Expe_Tel1',
  'Expe_Tel2',
  'Expe_Mail',
  'Dest_Langage',
  'Dest_Ad1',
  'Dest_Ad2',
  'Dest_Ad3',
  'Dest_Ad4',
  'Dest_Ville',
  'Dest_CP',
  'Dest_Pays',
  'Dest_Tel1',
  'Dest_Tel2',
  'Dest_Mail',
  'Poids',
  'Longueur',
  'Taille',
  'NbColis',
  'CRT_Valeur',
  'CRT_Devise',
  'Exp_Valeur',
  'Exp_Devise',
  'COL_Rel_Pays',
  'COL_Rel',
  'LIV_Rel_Pays',
  'LIV_Rel',
  'TAvisage',
  'TReprise',
  'Montage',
  'TRDV',
  'Assurance',
  'Instructions',
];

const TRACKING_PARAMS = ['Enseigne', 'Expedition', 'Langue'];

class MondialRelayError extends Error {
  constructor(stat, method) {
    const message = STAT_MESSAGES[stat] || 'Erreur inconnue';
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

function sanitizePhone(value) {
  if (!value) {
    return '';
  }
  const phone = String(value).replace(/[^0-9+]/g, '');
  // Mondial Relay expects either a national (0XXXXXXXXX) or international (+33XXXXXXXXX) number
  if (/^(\+\d{8,14}|0\d{9})$/.test(phone)) {
    return phone;
  }
  return '';
}

function sanitizePostalCode(value) {
  return String(value || '')
    .replace(/[^0-9A-Z]/gi, '')
    .toUpperCase()
    .slice(0, 5);
}

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

module.exports = function MondialRelayService(logger) {
  // Read at call time so the credentials can be rotated without a code change (and toggled in tests)
  function getConfig() {
    return {
      enseigne: process.env.MONDIAL_RELAY_ENSEIGNE,
      privateKey: process.env.MONDIAL_RELAY_PRIVATE_KEY,
      apiUrl: process.env.MONDIAL_RELAY_API_URL || DEFAULT_API_URL,
    };
  }

  function isConfigured() {
    const { enseigne, privateKey } = getConfig();
    return Boolean(enseigne && privateKey);
  }

  // Code used by the Mondial Relay pickup point widget on the website
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

  /**
   * Create a shipment to a pickup point and return its tracking number and label.
   *
   * @param {Object} shipment
   * @param {string} shipment.reference - Merchant reference (max 15 chars)
   * @param {Object} shipment.recipient - { name, address_1, address_2, postal_code, city, country, phone, email }
   * @param {Object} shipment.pickupPoint - { id, country }
   * @param {number} [shipment.weightInGrams]
   * @returns {Promise<{ shipment_number: string, label_url: string, tracking_url: string }>}
   */
  async function createPickupPointShipment(shipment) {
    if (!isConfigured()) {
      throw new Error('MONDIAL_RELAY_NOT_CONFIGURED');
    }
    const { enseigne } = getConfig();
    const sender = getSender();
    const { recipient, pickupPoint } = shipment;
    const weight =
      shipment.weightInGrams || process.env.MONDIAL_RELAY_PARCEL_WEIGHT_IN_GRAMS || DEFAULT_WEIGHT_IN_GRAMS;
    const values = {
      Enseigne: enseigne,
      ModeCol: process.env.MONDIAL_RELAY_COLLECT_MODE || DEFAULT_COLLECT_MODE,
      ModeLiv: DELIVERY_MODE_PICKUP_POINT,
      NDossier: sanitizeText(shipment.reference, 15),
      NClient: '',
      Expe_Langage: 'FR',
      Expe_Ad1: sanitizeText(sender.name),
      Expe_Ad2: '',
      Expe_Ad3: sanitizeText(sender.address_1),
      Expe_Ad4: sanitizeText(sender.address_2),
      Expe_Ville: sanitizeText(sender.city, 26),
      Expe_CP: sanitizePostalCode(sender.postal_code),
      Expe_Pays: sender.country,
      Expe_Tel1: sanitizePhone(sender.phone),
      Expe_Tel2: '',
      Expe_Mail: sender.email || '',
      Dest_Langage: 'FR',
      Dest_Ad1: sanitizeText(recipient.name),
      Dest_Ad2: '',
      Dest_Ad3: sanitizeText(recipient.address_1),
      Dest_Ad4: sanitizeText(recipient.address_2),
      Dest_Ville: sanitizeText(recipient.city, 26),
      Dest_CP: sanitizePostalCode(recipient.postal_code),
      Dest_Pays: (recipient.country || 'FR').toUpperCase(),
      Dest_Tel1: sanitizePhone(recipient.phone),
      Dest_Tel2: '',
      Dest_Mail: recipient.email || '',
      Poids: String(weight),
      Longueur: '',
      Taille: '',
      NbColis: '1',
      CRT_Valeur: '0',
      CRT_Devise: '',
      Exp_Valeur: '',
      Exp_Devise: '',
      COL_Rel_Pays: '',
      COL_Rel: '',
      LIV_Rel_Pays: (pickupPoint.country || 'FR').toUpperCase(),
      LIV_Rel: pickupPoint.id,
      TAvisage: '',
      TReprise: '',
      Montage: '',
      TRDV: '',
      Assurance: '',
      Instructions: '',
    };
    logger.info(`Mondial Relay: creating shipment ${values.NDossier} to pickup point ${pickupPoint.id}`);
    const { stat, xml } = await call('WSI2_CreationEtiquette', CREATE_LABEL_PARAMS, values);
    if (stat !== '0') {
      throw new MondialRelayError(stat, 'WSI2_CreationEtiquette');
    }
    const shipmentNumber = extractTag(xml, 'ExpeditionNum');
    let labelUrl = extractTag(xml, 'URL_Etiquette') || '';
    if (labelUrl.startsWith('/')) {
      labelUrl = `${LABEL_BASE_URL}${labelUrl}`;
    }
    logger.info(`Mondial Relay: shipment ${shipmentNumber} created`);
    return {
      shipment_number: shipmentNumber,
      label_url: labelUrl,
      tracking_url: getPublicTrackingUrl(shipmentNumber, values.Dest_CP),
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
      Langue: language.toUpperCase(),
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
    getWidgetBrandCode,
    createPickupPointShipment,
    getTracking,
    getPublicTrackingUrl,
    MondialRelayError,
    // exported for tests
    computeSecurity,
    sanitizeText,
    sanitizePhone,
  };
};

module.exports.MondialRelayError = MondialRelayError;
module.exports.TRACING_STAT = TRACING_STAT;
module.exports.getPublicTrackingUrl = getPublicTrackingUrl;
