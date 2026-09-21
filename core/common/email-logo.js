const path = require('path');

/**
 * The header logo, embedded in every email as a CID attachment.
 *
 * No image technique is truly universal, because any client can block images: what
 * differs is how broadly the markup itself is supported, and what the reader sees when
 * the image doesn't load.
 *
 *   - `data:` URIs are dropped by Gmail (web and mobile), Outlook desktop and Yahoo,
 *     which is most of our customers, so inlining the bytes in the HTML is out.
 *   - A remote URL needs the image hosted somewhere forever, and turns every email into
 *     an open tracker for whoever serves it.
 *   - A CID attachment is understood by Gmail, Apple Mail, iOS Mail, Outlook desktop,
 *     Outlook.com and Yahoo, travels with the message, and needs no hosting.
 *
 * So: CID, with `alt=""` on the <img> and the "Gladys Plus" wordmark rendered as text
 * next to it. When images are blocked the header degrades to that wordmark alone, which
 * is a deliberate looking header rather than a broken image or a stray alt label.
 *
 * The file is the published SVG logo cropped to the mark and rasterized at 96px (a 3x
 * asset for the 32px it is displayed at), quantized down to ~2 KB so it costs nothing
 * to attach.
 */
const LOGO_CONTENT_ID = 'gladys-logo';
const LOGO_FILENAME = 'gladys-logo.png';
const LOGO_PATH = path.join(__dirname, 'email-template', 'assets', LOGO_FILENAME);

/**
 * Nodemailer attachment descriptor. `contentDisposition: 'inline'` keeps clients from
 * listing the logo as a downloadable attachment next to the message.
 */
function buildLogoAttachment() {
  return {
    filename: LOGO_FILENAME,
    path: LOGO_PATH,
    cid: LOGO_CONTENT_ID,
    contentDisposition: 'inline',
  };
}

module.exports = {
  LOGO_CONTENT_ID,
  LOGO_FILENAME,
  LOGO_PATH,
  buildLogoAttachment,
};
