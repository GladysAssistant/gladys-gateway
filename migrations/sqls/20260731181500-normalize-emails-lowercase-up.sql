-- Normalize all emails to lowercase for consistent storage and login lookup.
UPDATE t_user
SET email = LOWER(TRIM(email))
WHERE email IS NOT NULL
  AND email <> LOWER(TRIM(email));

UPDATE t_invitation
SET email = LOWER(TRIM(email))
WHERE email IS NOT NULL
  AND email <> LOWER(TRIM(email));

-- Account name stores the billing email for Stripe-created accounts.
UPDATE t_account
SET name = LOWER(TRIM(name))
WHERE name IS NOT NULL
  AND name <> LOWER(TRIM(name));
