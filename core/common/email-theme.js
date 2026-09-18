/**
 * Horizon design tokens for the transactional emails.
 *
 * Gladys Assistant 5 introduced the "Horizon" design: frosted panels with generous
 * radii, floating above a soft living gradient. Emails can't use backdrop-filter, so
 * the glass effect is rebuilt with what email clients actually render: a gradient page
 * background (with a solid fallback), a translucent white panel on top of it, large
 * radii and a soft shadow.
 *
 * Everything an email client needs to render the layout has to be INLINE: `styles`
 * below holds those inline atoms, used from the EJS templates as `<%- s.xxx %>`.
 * The <style> block in partials/head.ejs only carries progressive enhancements
 * (responsive rules and dark mode), which are ignored by the clients that don't
 * support them without breaking the layout.
 */

const FONT_STACK = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif`;

const colors = {
  // Page: the Horizon gradient (mint -> periwinkle -> lavender -> peach).
  // pageFallback is what clients that drop background-image will show.
  pageFallback: '#eceffb',
  pageGradient: 'linear-gradient(160deg, #ddf2ec 0%, #cee0fa 26%, #e1d9f7 52%, #f6dfef 76%, #ffe4cd 100%)',

  // Frosted panel
  surface: '#ffffff',
  surfaceGlass: 'rgba(255, 255, 255, 0.86)',
  surfaceBorder: 'rgba(255, 255, 255, 0.85)',

  // Text
  heading: '#0b1220',
  text: '#3c4759',
  muted: '#78859c',
  faint: '#93a0b5',

  // Accents
  link: '#1f6fd0',
  primary: '#2f7fe0',
  primaryGradient: 'linear-gradient(135deg, #3fa9ef 0%, #2f6fe0 100%)',

  // Nested tiles (the "glass tiles" of the Horizon widgets)
  tile: '#f4f7fd',
  tileBorder: '#e4ebf7',
  successTile: '#e9f8f0',
  successBorder: '#c9ecdb',
  successText: '#1f6b48',
  warningTile: '#fff3e3',
  warningBorder: '#ffdfb8',
  warningText: '#8a5310',
  dangerTile: '#ffeeec',
  dangerBorder: '#ffd4cf',
  dangerText: '#a83228',

  divider: '#e8edf6',
};

const TONES = {
  neutral: { background: colors.tile, border: colors.tileBorder, text: colors.text },
  success: { background: colors.successTile, border: colors.successBorder, text: colors.successText },
  warning: { background: colors.warningTile, border: colors.warningBorder, text: colors.warningText },
  danger: { background: colors.dangerTile, border: colors.dangerBorder, text: colors.dangerText },
};

const styles = {
  font: FONT_STACK,

  h1: `margin: 0 0 20px; font-family: ${FONT_STACK}; font-size: 30px; line-height: 38px; font-weight: 700; letter-spacing: -0.02em; color: ${colors.heading};`,
  h2: `margin: 0 0 12px; font-family: ${FONT_STACK}; font-size: 18px; line-height: 26px; font-weight: 600; letter-spacing: -0.01em; color: ${colors.heading};`,

  // Small uppercase label above a section, like the widget titles in Gladys 5
  label: `margin: 0 0 10px; font-family: ${FONT_STACK}; font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${colors.faint};`,

  p: `margin: 0 0 18px; font-family: ${FONT_STACK}; font-size: 16px; line-height: 26px; color: ${colors.text};`,
  pTight: `margin: 0 0 10px; font-family: ${FONT_STACK}; font-size: 16px; line-height: 26px; color: ${colors.text};`,
  pLast: `margin: 0; font-family: ${FONT_STACK}; font-size: 16px; line-height: 26px; color: ${colors.text};`,
  small: `margin: 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 22px; color: ${colors.muted};`,

  link: `color: ${colors.link}; text-decoration: underline;`,
  // Long URLs shown as a fallback: they must wrap instead of stretching the layout
  urlLink: `font-family: ${FONT_STACK}; font-size: 14px; line-height: 22px; color: ${colors.link}; text-decoration: none; word-break: break-all; overflow-wrap: break-word;`,

  divider: `height: 1px; line-height: 1px; font-size: 0; background-color: ${colors.divider};`,
};

function tone(name) {
  return TONES[name] || TONES.neutral;
}

module.exports = {
  colors,
  styles,
  tone,
  FONT_STACK,
};
