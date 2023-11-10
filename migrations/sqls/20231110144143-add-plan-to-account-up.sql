CREATE TYPE account_plan_type AS ENUM(
    'plus',
    'lite'
);

ALTER TABLE t_account
    ADD COLUMN plan account_plan_type DEFAULT 'plus' NOT NULL;

