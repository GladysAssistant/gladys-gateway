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

// CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and db-migrate runs every
// migration inside one (BEGIN before, COMMIT after). The transaction opened by db-migrate is
// committed first (nothing ran in it yet), the index is built on its own, then a new
// transaction is opened for db-migrate to record the migration and commit.
exports.up = function(db) {
  return readSql('20261123120100-gladys-usage-created-at-index-up.sql')
    .then(function(data) {
      return db.runSql('COMMIT;')
        .then(function() {
          return db.runSql(data);
        })
        .then(function() {
          return db.runSql('BEGIN;');
        });
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
