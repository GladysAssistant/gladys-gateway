const Promise = require('bluebird');

module.exports = function(db) {

  function clean() {
    var tablesToClean = [
      't_history',
      't_reset_password',
      't_device',
      't_invitation',
      't_instance',
      't_user',
      't_account'
    ];

    return Promise.each(tablesToClean, function(tableName) {
      return db.query(`DELETE FROM ${tableName}`);
    });
  }

  async function fill() {
    var toFillInOrder = [
      't_account',
      't_user',
      't_instance',
      't_invitation',
      't_device',
      't_reset_password',
      't_history'
    ];

    return Promise.each(toFillInOrder, function(tableName){
      return db[tableName].insert(require(`./fixtures/${tableName}.js`));
    });
  }

  return {
    clean,
    fill
  };
};