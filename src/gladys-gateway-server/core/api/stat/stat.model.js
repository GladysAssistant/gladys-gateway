const NUMBER_OF_GLADYS_4_INSTANCES_STATS_KEY = 'stats:gladys-4-instances';
const STATS_EXPIRY_IN_SECONDS = 60 * 60;

module.exports = function StatModel(logger, db, redisClient) {
  async function getNumberOfGladys4Instances() {
    // get stats in Redis
    const statsInRedis = await redisClient.getAsync(NUMBER_OF_GLADYS_4_INSTANCES_STATS_KEY);
    // if present, return
    if (statsInRedis) {
      return JSON.parse(statsInRedis);
    }
    // else, get in DB
    const request = `
      SELECT COUNT(DISTINCT client_id) as nb_instances, to_char(created_at, 'YYYY-MM') as month
      FROM t_gladys_usage
      WHERE client_id IS NOT NULL
      AND created_at >  CURRENT_DATE - INTERVAL '6 months'
      GROUP BY month
      ORDER BY month;
    `;

    const stats = await db.query(request);
    await redisClient.setAsync(
      NUMBER_OF_GLADYS_4_INSTANCES_STATS_KEY,
      JSON.stringify(stats),
      'EX',
      STATS_EXPIRY_IN_SECONDS,
    );
    return stats;
  }

  return {
    getNumberOfGladys4Instances,
  };
};
