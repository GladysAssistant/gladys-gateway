ALTER TABLE t_account DROP COLUMN instance_offline_alert_sent_at;
ALTER TABLE t_account DROP COLUMN instance_offline_alert_delay_in_minutes;
ALTER TABLE t_account DROP COLUMN instance_offline_alert_enabled;
ALTER TABLE t_instance DROP COLUMN last_seen_at;
