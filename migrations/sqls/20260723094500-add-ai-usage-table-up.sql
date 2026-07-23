CREATE TABLE t_ai_usage (
    id uuid DEFAULT uuid_generate_v4 () NOT NULL,
    account_id uuid NOT NULL,
    instance_id uuid NOT NULL,
    request_type character varying(50) NOT NULL,
    purpose character varying(255),
    categories text[],
    model character varying(255),
    prompt_tokens integer,
    completion_tokens integer,
    total_tokens integer,
    response_time_ms integer,
    finish_reason character varying(255),
    api_response_id character varying(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    is_deleted boolean DEFAULT FALSE NOT NULL
);

ALTER TABLE ONLY t_ai_usage
    ADD CONSTRAINT t_ai_usage_pkey PRIMARY KEY (id);

ALTER TABLE ONLY t_ai_usage
    ADD CONSTRAINT fk_t_ai_usage__account_id_t_account FOREIGN KEY (account_id) REFERENCES t_account (id);

ALTER TABLE ONLY t_ai_usage
    ADD CONSTRAINT fk_t_ai_usage__instance_id_t_instance FOREIGN KEY (instance_id) REFERENCES t_instance (id);

CREATE INDEX ix_t_ai_usage_account_id_created_at ON t_ai_usage USING btree (account_id, created_at);

CREATE INDEX ix_t_ai_usage_created_at ON t_ai_usage USING btree (created_at);
