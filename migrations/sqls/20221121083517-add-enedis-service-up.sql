CREATE TABLE t_enedis_usage_point (
    usage_point_id character varying(255) NOT NULL,
    account_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ONLY t_enedis_usage_point
    ADD CONSTRAINT t_enedis_usage_point_pkey PRIMARY KEY (usage_point_id);

ALTER TABLE ONLY t_enedis_usage_point
    ADD CONSTRAINT fk_t_enedis_usage_point__account_id_t_account FOREIGN KEY (account_id) REFERENCES t_account (id);

CREATE INDEX ix_t_enedis_usage_point_account_id ON t_enedis_usage_point USING btree (account_id);

CREATE TABLE t_enedis_consumption_load_curve (
    usage_point_id character varying(255) NOT NULL,
    value double precision NOT NULL,
    created_at timestamptz NOT NULL
);

ALTER TABLE ONLY t_enedis_consumption_load_curve
    ADD CONSTRAINT fk_t_enedis_consumption_load_curve__usage_point_id_t_enedis_usage_point FOREIGN KEY (usage_point_id) REFERENCES t_enedis_usage_point (usage_point_id);

CREATE UNIQUE INDEX idx_unique_enedis_consumption_load_curve ON t_enedis_consumption_load_curve (usage_point_id, created_at);

CREATE TABLE t_enedis_daily_consumption (
    usage_point_id character varying(255) NOT NULL,
    value double precision NOT NULL,
    created_at date NOT NULL
);

CREATE UNIQUE INDEX idx_unique_enedis_daily_consumption ON t_enedis_daily_consumption (usage_point_id, created_at);

ALTER TABLE ONLY t_enedis_daily_consumption
    ADD CONSTRAINT fk_t_enedis_daily_consumption__usage_point_id_t_enedis_usage_point FOREIGN KEY (usage_point_id) REFERENCES t_enedis_usage_point (usage_point_id);

CREATE TABLE t_enedis_sync (
    id uuid DEFAULT uuid_generate_v4 () NOT NULL,
    usage_point_id character varying(255) NOT NULL,
    jobs_done integer NOT NULL DEFAULT 0,
    jobs_total integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ONLY t_enedis_sync
    ADD CONSTRAINT t_enedis_sync_pkey PRIMARY KEY (id);

ALTER TABLE ONLY t_enedis_sync
    ADD CONSTRAINT fk_t_enedis_sync__usage_point_id_t_enedis_usage_point FOREIGN KEY (usage_point_id) REFERENCES t_enedis_usage_point (usage_point_id);

