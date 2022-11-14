CREATE TABLE t_gladys_version (
    id uuid DEFAULT uuid_generate_v4 () NOT NULL,
    name character varying(255),
    active boolean DEFAULT FALSE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    is_deleted boolean DEFAULT FALSE NOT NULL
);

ALTER TABLE ONLY t_gladys_version
    ADD CONSTRAINT t_gladys_version_pkey PRIMARY KEY (id);

CREATE TABLE t_gladys_usage (
    id uuid DEFAULT uuid_generate_v4 () NOT NULL,
    client_id uuid NULL,
    event_type character varying(255),
    user_agent character varying(255),
    system character varying(255),
    node_version character varying(255),
    is_docker boolean,
    country character varying(255),
    region character varying(255),
    timezone character varying(255),
    region_latitude double precision,
    region_longitude double precision,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ONLY t_gladys_usage
    ADD CONSTRAINT t_gladys_usage_pkey PRIMARY KEY (id);

