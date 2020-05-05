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

