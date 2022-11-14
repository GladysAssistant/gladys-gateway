ALTER TABLE t_backup
    DROP COLUM status;

DROP TYPE backup_status_type;

ALTER TABLE t_backup
    ALTER COLUMN path SET NOT NULL;

