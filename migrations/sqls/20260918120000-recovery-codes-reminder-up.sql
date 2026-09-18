-- Date the "generate your recovery codes" email was last sent by the recovery codes reminder
-- job to a user having two factor authentication enabled without recovery codes.
ALTER TABLE t_user ADD COLUMN recovery_codes_reminder_sent_at timestamptz;
