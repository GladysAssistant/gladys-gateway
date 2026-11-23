-- GET /stats counts the distinct instances per month over the last months of t_gladys_usage.
-- Without an index on created_at, it read the whole table (every row since 2019) each time,
-- evicting the cache of the database. With this index, it only reads the index entries of
-- the period (index-only scan: client_id is included).
-- Built CONCURRENTLY not to block the inserts of the usage points during the build (see the
-- migration file, which runs it outside of the transaction of db-migrate). If the build fails,
-- an INVALID index is left behind: drop it (DROP INDEX ix_t_gladys_usage_created_at) and run
-- the migration again.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_t_gladys_usage_created_at ON t_gladys_usage USING btree (created_at) INCLUDE (client_id) WHERE client_id IS NOT NULL
