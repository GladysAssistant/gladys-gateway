-- The Gladys user (on the instance) the invitation was sent for: set by the admin inviting
-- from the Users page of Gladys, copied onto the user created from the invitation so they
-- land on the right Gladys user without picking one.
ALTER TABLE t_invitation ADD COLUMN gladys_4_user_id uuid;
