CREATE TABLE t_backup (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    account_id uuid NOT NULL,
    path character varying(255) NOT NULL,
    size integer NOT NULL,
    created_at timestamptz NOT NULL default now(),
    updated_at timestamptz NOT NULL default now(),
    is_deleted boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY t_backup ADD CONSTRAINT t_backup_pkey PRIMARY KEY (id);
ALTER TABLE t_backup OWNER TO postgres;

ALTER TABLE ONLY t_backup
    ADD CONSTRAINT fk_t_backup__account_id_t_account FOREIGN KEY (account_id) REFERENCES t_account(id);

CREATE INDEX ix_t_backup_account_id ON t_backup USING btree (account_id);
