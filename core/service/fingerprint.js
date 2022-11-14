const crypto = require('crypto');

module.exports = function FingerprintService() {
  function generate(key) {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const withColons = hash.replace(/(.{2})(?=.)/g, '$1:');
    return withColons;
  }

  return {
    generate,
  };
};
