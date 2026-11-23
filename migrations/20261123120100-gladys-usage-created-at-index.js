'use strict';

var dbm;
var type;
var seed;
var fs = require('fs');
var path = require('path');
var Promise;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

function readSql(fileName) {
  var filePath = path.join(__dirname, 'sqls', fileName);
  return new Promise( function( resolve, reject ) {
    fs.readFile(filePath, {encoding: 'utf-8'}, function(err,data){
      if (err) return reject(err);
      console.log('received data: ' + data);

      resolve(data);
    });
  });
}

// The migrations run when the server starts (index.js): a container stopped while the index
// is being built (startup timeout, new deployment...) leaves an INVALID index behind, that
// IF NOT EXISTS would then take for the index. It is dropped first, CONCURRENTLY like the build
// (a plain DROP INDEX waits for an exclusive lock on the table, blocking the inserts meanwhile),
// to be built again. A valid index (built by hand before the deployment for example) is kept.
var FIND_INVALID_INDEX_SQL =
  "SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('ix_t_gladys_usage_created_at') AND NOT indisvalid";
var DROP_INVALID_INDEX_SQL = 'DROP INDEX CONCURRENTLY IF EXISTS ix_t_gladys_usage_created_at';

// CREATE (and DROP) INDEX CONCURRENTLY cannot run inside a transaction block, and db-migrate
// runs every migration inside one (BEGIN before, COMMIT after). The transaction opened by
// db-migrate is committed first, the index is dropped and built on their own, then a new
// transaction is opened for db-migrate to record the migration and commit.
exports.up = function(db) {
  var createIndexSql;
  return readSql('20261123120100-gladys-usage-created-at-index-up.sql')
    .then(function(data) {
      createIndexSql = data;
      return db.runSql('COMMIT;');
    })
    .then(function() {
      return db.all(FIND_INVALID_INDEX_SQL);
    })
    .then(function(invalidIndexes) {
      if (invalidIndexes.length > 0) {
        console.log('ix_t_gladys_usage_created_at is INVALID (interrupted build): dropping it to build it again');
        return db.runSql(DROP_INVALID_INDEX_SQL);
      }
      return null;
    })
    .then(function() {
      return db.runSql(createIndexSql);
    })
    .then(function() {
      return db.runSql('BEGIN;');
    });
};

exports.down = function(db) {
  return readSql('20261123120100-gladys-usage-created-at-index-down.sql')
    .then(function(data) {
      return db.runSql(data);
    });
};

exports._meta = {
  "version": 1
};
