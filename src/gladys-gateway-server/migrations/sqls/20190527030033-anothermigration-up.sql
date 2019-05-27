CREATE TABLE t_gladys_version (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name character varying(255),
    active boolean DEFAULT false NOT NULL,
    created_at timestamptz NOT NULL default now(),
    updated_at timestamptz NOT NULL default now(),
    is_deleted boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY t_gladys_version ADD CONSTRAINT t_gladys_version_pkey PRIMARY KEY (id);
ALTER TABLE t_gladys_version OWNER TO postgres;

CREATE TABLE t_gladys_usage (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    client_id uuid NULL,
    event_type character varying(255),
    version character varying(255),
    country character varying(255),
    region character varying(255),
    timezone character varying(255),
    region_latitude double precision,
    region_longitude double precision,
    created_at timestamptz NOT NULL default now()
);

ALTER TABLE ONLY t_gladys_usage ADD CONSTRAINT t_gladys_usage_pkey PRIMARY KEY (id);
ALTER TABLE t_gladys_usage OWNER TO postgres;

