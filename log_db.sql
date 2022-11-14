CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;

CREATE TABLE t_stat (
  id uuid DEFAULT uuid_generate_v4 () NOT NULL,
  event_type character varying(255) NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE t_error (
  id uuid DEFAULT uuid_generate_v4 () NOT NULL,
  event_type character varying(255) NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_t_stat_created_at ON t_stat USING btree (created_at);

CREATE INDEX ix_t_stat_event_type ON t_stat USING btree (event_type);

CREATE INDEX ix_t_error_created_at ON t_error USING btree (created_at);

CREATE INDEX ix_t_error_event_type ON t_stat USING btree (event_type);

