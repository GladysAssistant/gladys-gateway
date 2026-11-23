-- The users of an account are looked up by account_id on hot paths (Google Home report
-- state, instance watchdog, members of an account) and t_user had no index on it: every one
-- of these queries scanned the whole table.
CREATE INDEX IF NOT EXISTS ix_t_user_account_id ON t_user USING btree (account_id);
