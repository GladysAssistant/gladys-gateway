require('dotenv').config();

const { initEnedisListener } = require('./core/enedis/enedisListener');

(async () => {
  await initEnedisListener();
})();
