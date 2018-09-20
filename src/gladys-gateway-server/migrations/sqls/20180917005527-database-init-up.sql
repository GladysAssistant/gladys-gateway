/* Replace with your SQL commands */

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;

------------------
-- CREATE TABLE --
------------------

CREATE TYPE user_role AS ENUM ('user', 'admin');

CREATE TABLE t_user (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name character varying(255),
    email character varying(255) NOT NULL ,
    language character varying(10) NOT NULL,
    email_confirmation_token_hash character varying NOT NULL,
    email_confirmed boolean DEFAULT false NOT NULL,
    profile_url character varying(255),
    role user_role DEFAULT 'user' NOT NULL,
    gladys_user_id integer,
    srp_salt character varying,
    srp_verifier character varying,
    two_factor_secret character varying,
    two_factor_enabled boolean DEFAULT false NOT NULL,
    public_key character varying,
    encrypted_private_key character varying,
    stripe_customer_id character varying,
    account_id uuid NOT NULL,
    created_at timestamp NOT NULL default now(),
    updated_at timestamp NOT NULL default now(),
    is_deleted boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY t_user ADD CONSTRAINT t_user_pkey PRIMARY KEY (id);
ALTER TABLE t_user OWNER TO postgres;

CREATE TABLE t_device (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name character varying(255),
    push_notification_token character varying(255),
    refresh_token_hash character varying,
    revoked boolean DEFAULT false NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp NOT NULL default now(),
    updated_at timestamp NOT NULL default now(),
    is_deleted boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY t_device ADD CONSTRAINT t_device_pkey PRIMARY KEY (id);
ALTER TABLE t_device OWNER TO postgres;

CREATE TABLE t_reset_password (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    token_hash character varying NOT NULL,
    used boolean DEFAULT false NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp NOT NULL default now(),
    updated_at timestamp NOT NULL default now(),
    is_deleted boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY t_reset_password ADD CONSTRAINT t_reset_password_pkey PRIMARY KEY (id);
ALTER TABLE t_reset_password OWNER TO postgres;

CREATE TABLE t_account (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp NOT NULL default now(),
    updated_at timestamp NOT NULL default now(),
    is_deleted boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY t_account ADD CONSTRAINT t_account_pkey PRIMARY KEY (id);
ALTER TABLE t_account OWNER TO postgres;

CREATE TABLE t_instance (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    public_key character varying,
    refresh_token_hash character varying,
    account_id uuid NOT NULL,
    created_at timestamp NOT NULL default now(),
    updated_at timestamp NOT NULL default now(),
    is_deleted boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY t_instance ADD CONSTRAINT t_instance_pkey PRIMARY KEY (id);
ALTER TABLE t_instance OWNER TO postgres;

CREATE TABLE t_invitation (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    email character varying(255) NOT NULL,
    token_hash character varying,
    revoked boolean DEFAULT false NOT NULL,
    accepted boolean DEFAULT false NOT NULL,
    account_id uuid NOT NULL,
    created_at timestamp NOT NULL default now(),
    updated_at timestamp NOT NULL default now(),
    is_deleted boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY t_invitation ADD CONSTRAINT t_invitation_pkey PRIMARY KEY (id);
ALTER TABLE t_invitation OWNER TO postgres;

CREATE TYPE history_action AS ENUM ('login', 'logout', 'invite-user', 'sent-message');

CREATE TABLE t_history (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    action history_action NOT NULL,
    params jsonb DEFAULT '{}' NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp NOT NULL default now(),
    updated_at timestamp NOT NULL default now(),
    is_deleted boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY t_history ADD CONSTRAINT t_history_pkey PRIMARY KEY (id);
ALTER TABLE t_history OWNER TO postgres;

-------------------------
-- CREATE FOREIGN KEYS --
-------------------------

ALTER TABLE ONLY t_user
    ADD CONSTRAINT fk_t_user__account_id_t_account FOREIGN KEY (account_id) REFERENCES t_account(id);

ALTER TABLE ONLY t_device
    ADD CONSTRAINT fk_t_device__user_id_t_user FOREIGN KEY (user_id) REFERENCES t_user(id);

ALTER TABLE ONLY t_reset_password
    ADD CONSTRAINT fk_t_reset_password__user_id_t_user FOREIGN KEY (user_id) REFERENCES t_user(id);

ALTER TABLE ONLY t_instance
    ADD CONSTRAINT fk_t_instance__account_id_t_account FOREIGN KEY (account_id) REFERENCES t_account(id);

ALTER TABLE ONLY t_invitation
    ADD CONSTRAINT fk_t_invitation__account_id_t_account FOREIGN KEY (account_id) REFERENCES t_account(id);

ALTER TABLE ONLY t_history
    ADD CONSTRAINT fk_t_history__user_id_t_user FOREIGN KEY (user_id) REFERENCES t_user(id);

--------------------
-- CREATE INDEXES --
--------------------

CREATE INDEX ix_t_user_email ON t_user USING btree (lower(email));
CREATE INDEX ix_t_device_user_id ON t_device USING btree (user_id);
CREATE INDEX ix_t_reset_password_user_id ON t_reset_password USING btree (user_id);
CREATE INDEX ix_t_instance_account_id ON t_instance USING btree (account_id);
CREATE INDEX ix_t_invitation_account_id ON t_invitation USING btree (account_id);
CREATE INDEX ix_t_history_user_id ON t_history USING btree (user_id);

---------------------------
-- CREATE UNIQUE INDEXES --
---------------------------

-- We don't want to have duplicate emails in database
CREATE UNIQUE INDEX idx_unique_email on t_user(LOWER(email))  WHERE (is_deleted = false AND email_confirmed = true);