ALTER TABLE t_account
    ADD COLUMN stripe_portal_key uuid DEFAULT uuid_generate_v4 () NOT NULL;

