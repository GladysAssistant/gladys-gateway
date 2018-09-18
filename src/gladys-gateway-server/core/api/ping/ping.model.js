module.exports = function PingModel(logger, db, redisClient) {

  /**
   * We want to test if the database/redis
   * connections are working properly
   */
  async function ping() {
    await db.query('SELECT 1 FROM user');
    await redisClient.getAsync('random-key');
  }

  return {
    ping
  };
};