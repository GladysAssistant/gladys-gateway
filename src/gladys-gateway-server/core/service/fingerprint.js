const crypto = require('crypto');

module.exports = function () {
  
  function generate(key) {
    var hash = crypto.createHash('sha256').update(key).digest('hex');
    var withColons = hash.replace(/(.{2})(?=.)/g, '$1:');
    return withColons;
  }

  return {
    generate
  };
};