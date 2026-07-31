/**
 * Normalize an email address for storage and lookup.
 * Always trim + lowercase so emails are compared consistently.
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  if (typeof email !== 'string') {
    return email;
  }

  return email.trim().toLowerCase();
}

module.exports = {
  normalizeEmail,
};
