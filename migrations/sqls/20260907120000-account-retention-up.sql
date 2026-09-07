-- Internal accounts (tests, team) are not customers: excluded from the stats and from the
-- automated clean up of unpaid accounts.
ALTER TABLE t_account ADD COLUMN is_internal boolean NOT NULL DEFAULT false;
-- Date the "your account will be deleted" email was sent by the retention job.
ALTER TABLE t_account ADD COLUMN deletion_warning_sent_at timestamptz;
