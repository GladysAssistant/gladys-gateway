CREATE TYPE tempo_historical_data_day_type AS ENUM(
    'blue',
    'white',
    'red'
);

CREATE TABLE t_tempo_historical_data(
    day_type tempo_historical_data_day_type NOT NULL,
    created_at date NOT NULL
);

CREATE INDEX idx_tempo_historical_data_created_at ON t_tempo_historical_data(created_at);

