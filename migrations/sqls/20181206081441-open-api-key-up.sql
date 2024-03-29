CREATE TABLE t_open_api_key (
    id uuid DEFAULT uuid_generate_v4 () NOT NULL,
    name character varying(255),
    api_key_hash character varying,
    revoked boolean DEFAULT FALSE NOT NULL,
    user_id uuid NOT NULL,
    last_used timestamptz NULL DEFAULT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    is_deleted boolean DEFAULT FALSE NOT NULL
);

ALTER TABLE ONLY t_open_api_key
    ADD CONSTRAINT t_open_api_key_pkey PRIMARY KEY (id);

ALTER TABLE ONLY t_open_api_key
    ADD CONSTRAINT fk_t_open_api_key__user_id_t_user FOREIGN KEY (user_id) REFERENCES t_user (id);

CREATE INDEX ix_t_open_api_key_user_id ON t_open_api_key USING btree (user_id);

CREATE INDEX ix_t_open_api_key_api_key_hash ON t_open_api_key USING btree (api_key_hash);

