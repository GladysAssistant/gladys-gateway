-- Instance watchdog ("is my Gladys alive?"): the gateway sees every instance connect and
-- disconnect in websocket, and warns the admins of the account by email when their
-- instance has been unreachable for too long.

-- Last time the instance was seen connected to the gateway: written when its websocket
-- disconnects and refreshed by the watchdog job for the instances still connected.
ALTER TABLE t_instance ADD COLUMN last_seen_at timestamptz;

-- Opt-in of the account (changed by its admins), with the delay after which the
-- "instance offline" email is sent to the admins.
ALTER TABLE t_account ADD COLUMN instance_offline_alert_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE t_account ADD COLUMN instance_offline_alert_delay_in_minutes integer NOT NULL DEFAULT 60;
-- Date of the "instance offline" email of the outage in progress, null once the instance is
-- back online (the "back online" email has been sent) or when no outage was reported.
ALTER TABLE t_account ADD COLUMN instance_offline_alert_sent_at timestamptz;
