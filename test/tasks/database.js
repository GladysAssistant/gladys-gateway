const Promise = require('bluebird');

module.exports = function Database(db) {
  function clean() {
    const tablesToClean = [
      't_enedis_sync',
      't_enedis_daily_consumption',
      't_enedis_consumption_load_curve',
      't_enedis_usage_point',
      't_gladys_usage',
      't_backup',
      't_gladys_version',
      't_open_api_key',
      't_account_payment_activity',
      't_history',
      't_reset_password',
      't_device',
      't_invitation',
      't_instance',
      't_user',
      't_account',
    ];

    return Promise.each(tablesToClean, (tableName) => db.query(`DELETE FROM ${tableName}`));
  }

  async function fill() {
    const toFillInOrder = [
      't_account',
      't_user',
      't_instance',
      't_invitation',
      't_device',
      't_reset_password',
      't_history',
      't_account_payment_activity',
      't_open_api_key',
      't_gladys_version',
      't_backup',
      't_gladys_usage',
    ];

    return Promise.each(toFillInOrder, (tableName) => db[tableName].insert(require(`./fixtures/${tableName}.js`))); // eslint-disable-line
  }

  return {
    clean,
    fill,
  };
};
