require('dotenv').config();
const DBMigrate = require('db-migrate');
const server = require('./core/index');

(async () => {
  // we perform database migration if needed
  const dbmigrate = DBMigrate.getInstance(true, {
    env: process.env.NODE_ENV === 'production' ? 'production' : 'dev',
  });
  await dbmigrate.up();
  // then, we start server
  server();
})();
