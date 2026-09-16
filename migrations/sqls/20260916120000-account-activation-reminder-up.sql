-- Language of the Stripe Checkout the account was created from ("fr" or "en"): the emails
-- sent to an account that has no user yet (activation reminder, deletion warning) use it.
ALTER TABLE t_account ADD COLUMN language character varying(2);
-- Date the "your account is not activated yet" email was sent by the activation reminder job.
ALTER TABLE t_account ADD COLUMN activation_reminder_sent_at timestamptz;
