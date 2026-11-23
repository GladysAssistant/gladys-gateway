const NUMBER_OF_GLADYS_4_INSTANCES_STATS_KEY = 'stats:gladys-4-instances';
const NUMBER_OF_GLADYS_4_PLUS_USERS = 'stats:gladys-4-plus-users';
const STATS_EXPIRY_IN_SECONDS = 60 * 60;
// The instances per month are refreshed every hour by the scheduler (stats-refresh job), and
// kept longer than that: a run that fails or is late does not leave GET /stats, a public
// route, without cache (a request would then have to compute them).
const GLADYS_4_INSTANCES_STATS_EXPIRY_IN_SECONDS = 3 * 60 * 60;

module.exports = function StatModel(logger, db, redisClient) {
  // The computation in progress in this process: the requests arriving meanwhile wait for it
  // instead of starting the same query again
  let pendingRefresh = null;

  async function computeNumberOfGladys4Instances() {
    // Whole calendar months: the oldest month used to start on the same day 6 months ago, and
    // was under-counted. The created_at index (client_id included) serves the period without
    // reading the table, and the distinct (month, instance) pairs are counted in a hash table,
    // where a COUNT(DISTINCT) sorted every row of the period (in temporary files).
    const request = `
      SELECT COUNT(*) as nb_instances, month
      FROM (
        SELECT DISTINCT to_char(created_at, 'YYYY-MM') as month, client_id
        FROM t_gladys_usage
        WHERE client_id IS NOT NULL
        AND created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '6 months'
      ) AS instances_by_month
      GROUP BY month
      ORDER BY month;
    `;
    const stats = await db.query(request);
    await redisClient.set(NUMBER_OF_GLADYS_4_INSTANCES_STATS_KEY, JSON.stringify(stats), {
      EX: GLADYS_4_INSTANCES_STATS_EXPIRY_IN_SECONDS,
    });
    return stats;
  }

  /**
   * Compute the number of instances per month and cache it. Called every hour by the
   * scheduler, so that GET /stats always finds them in cache.
   */
  function refreshNumberOfGladys4Instances() {
    if (pendingRefresh === null) {
      pendingRefresh = computeNumberOfGladys4Instances().finally(() => {
        pendingRefresh = null;
      });
    }
    return pendingRefresh;
  }

  async function getNumberOfGladys4Instances() {
    const statsInRedis = await redisClient.get(NUMBER_OF_GLADYS_4_INSTANCES_STATS_KEY);
    if (statsInRedis) {
      return JSON.parse(statsInRedis);
    }
    // Only when the cache is cold (first start, scheduler disabled or failing for hours)
    return refreshNumberOfGladys4Instances();
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
      AND is_internal = false
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
    refreshNumberOfGladys4Instances,
    getNumberOfPayingUsers,
  };
};
