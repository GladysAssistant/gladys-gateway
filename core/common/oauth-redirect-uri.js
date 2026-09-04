/**
 * Strict validation of an OAuth redirect_uri against an allow list.
 *
 * A plain `startsWith` check is bypassable: "https://oauth-redirect.googleusercontent.com.attacker.com"
 * starts with "https://oauth-redirect.googleusercontent.com". Here the URI is parsed and
 * the scheme and host must match exactly. The path must match exactly too, except when
 * the allowed entry has no path (only an origin), in which case any path is accepted.
 * @param {string} redirectUri - The redirect_uri sent by the client.
 * @param {Array<string>} allowedRedirectUris - The allow list.
 * @returns {boolean} True if the redirect_uri is allowed.
 */
function isAllowedRedirectUri(redirectUri, allowedRedirectUris) {
  if (typeof redirectUri !== 'string') {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(redirectUri);
  } catch (e) {
    return false;
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return false;
  }

  return allowedRedirectUris.some((allowed) => {
    const allowedParsed = new URL(allowed);
    if (parsed.host !== allowedParsed.host) {
      return false;
    }
    const allowedHasPath = allowedParsed.pathname !== '/';
    return allowedHasPath ? parsed.pathname === allowedParsed.pathname : true;
  });
}

/**
 * Build the URL the browser is redirected to, with state and code safely encoded.
 * @param {string} redirectUri - The validated redirect_uri.
 * @param {string} state - The opaque state sent by the OAuth client.
 * @param {string} code - The authorization code.
 * @returns {string} The redirect URL.
 */
function buildRedirectUrl(redirectUri, state, code) {
  const url = new URL(redirectUri);
  url.searchParams.set('state', state === undefined || state === null ? '' : String(state));
  url.searchParams.set('code', code);
  return url.toString();
}

module.exports = {
  isAllowedRedirectUri,
  buildRedirectUrl,
};
