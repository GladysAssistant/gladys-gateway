require('dotenv').config();

(async() => {

  // we perform database migration if needed
  const DBMigrate = require('db-migrate');
  const dbmigrate = DBMigrate.getInstance(true, {
    env: (process.env.NODE_ENV === 'production') ? 'production' : 'dev' 
  });
  await dbmigrate.up();

  // then, we start server
  require('./core/index')();
})();