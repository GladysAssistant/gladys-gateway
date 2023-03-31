const NUMBER_OF_GLADYS_4_INSTANCES_STATS_KEY = 'stats:gladys-4-instances';
const NUMBER_OF_GLADYS_4_PLUS_USERS = 'stats:gladys-4-plus-users';
const STATS_EXPIRY_IN_SECONDS = 60 * 60;

module.exports = function StatModel(logger, db, redisClient) {
  async function getNumberOfGladys4Instances() {
    // get stats in Redis
    const statsInRedis = await redisClient.get(NUMBER_OF_GLADYS_4_INSTANCES_STATS_KEY);
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
    await redisClient.set(NUMBER_OF_GLADYS_4_INSTANCES_STATS_KEY, JSON.stringify(stats), {
      EX: STATS_EXPIRY_IN_SECONDS,
    });
    return stats;
  }

  async function getNumberOfPayingUsers() {
    // get stats in Redis
    const statsInRedis = await redisClient.get(NUMBER_OF_GLADYS_4_PLUS_USERS);
    // if present, return
    if (statsInRedis) {
      return parseInt(statsInRedis, 10);
    }
    // else, get in DB
    const request = `
      SELECT COUNT(id) as nb_gladys_plus_users
      FROM t_account
      WHERE current_period_end > NOW()
      AND status = 'active'
      AND stripe_customer_id IS NOT NULL
      AND stripe_subscription_id IS NOT NULL;
    `;

    const stats = await db.query(request);
    const nbUsers = stats[0].nb_gladys_plus_users;
    await redisClient.set(NUMBER_OF_GLADYS_4_PLUS_USERS, nbUsers, {
      EX: STATS_EXPIRY_IN_SECONDS,
    });
    return parseInt(nbUsers, 10);
  }

  return {
    getNumberOfGladys4Instances,
    getNumberOfPayingUsers,
  };
};
