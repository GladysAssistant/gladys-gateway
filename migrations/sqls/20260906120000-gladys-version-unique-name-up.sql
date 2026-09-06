-- A Gladys version is identified by its name (ex: v4.57.0). The admin API relies on this
-- constraint to make the "create version" call idempotent from the release GitHub Action.
CREATE UNIQUE INDEX idx_unique_gladys_version_name ON t_gladys_version (name);
