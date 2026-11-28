CREATE TABLE t_starter_kit_order (
    id uuid DEFAULT uuid_generate_v4 () NOT NULL,
    account_id uuid,
    email character varying(255) NOT NULL,
    customer_name character varying(255),
    phone character varying(50),
    language character varying(2) DEFAULT 'fr' NOT NULL,
    stripe_checkout_session_id character varying(255),
    stripe_customer_id character varying(255),
    stripe_payment_intent_id character varying(255),
    amount_total integer,
    currency character varying(3),
    shipping_address jsonb,
    status character varying(50) DEFAULT 'paid' NOT NULL,
    tracking_token_hash character varying(255) NOT NULL,
    ssh_password character varying(255),
    mini_pc_expected_at date,
    pickup_point jsonb,
    pickup_point_selected_at timestamptz,
    pickup_point_reminder_sent_at timestamptz,
    shipment_number character varying(50),
    label_url text,
    notes text,
    paid_at timestamptz,
    mini_pc_ordered_at timestamptz,
    mini_pc_received_at timestamptz,
    installed_at timestamptz,
    shipped_at timestamptz,
    delivered_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    is_deleted boolean DEFAULT FALSE NOT NULL
);

ALTER TABLE ONLY t_starter_kit_order
    ADD CONSTRAINT t_starter_kit_order_pkey PRIMARY KEY (id);

ALTER TABLE ONLY t_starter_kit_order
    ADD CONSTRAINT fk_t_starter_kit_order__account_id_t_account FOREIGN KEY (account_id) REFERENCES t_account (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX ux_t_starter_kit_order_stripe_checkout_session_id ON t_starter_kit_order USING btree (stripe_checkout_session_id);

CREATE UNIQUE INDEX ux_t_starter_kit_order_tracking_token_hash ON t_starter_kit_order USING btree (tracking_token_hash);

CREATE INDEX ix_t_starter_kit_order_status ON t_starter_kit_order USING btree (status);

CREATE INDEX ix_t_starter_kit_order_email ON t_starter_kit_order USING btree (email);

CREATE TABLE t_starter_kit_order_event (
    id uuid DEFAULT uuid_generate_v4 () NOT NULL,
    order_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ONLY t_starter_kit_order_event
    ADD CONSTRAINT t_starter_kit_order_event_pkey PRIMARY KEY (id);

ALTER TABLE ONLY t_starter_kit_order_event
    ADD CONSTRAINT fk_t_starter_kit_order_event__order_id_t_starter_kit_order FOREIGN KEY (order_id) REFERENCES t_starter_kit_order (id);

CREATE INDEX ix_t_starter_kit_order_event_order_id_created_at ON t_starter_kit_order_event USING btree (order_id, created_at);
