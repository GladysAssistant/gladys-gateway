CREATE TYPE backup_status_type AS enum (
    'started',
    'successed',
    'failed'
);

ALTER TABLE t_backup
    ADD COLUMN status backup_status_type NOT NULL DEFAULT 'started';

ALTER TABLE t_backup
    ALTER COLUMN path DROP NOT NULL;

