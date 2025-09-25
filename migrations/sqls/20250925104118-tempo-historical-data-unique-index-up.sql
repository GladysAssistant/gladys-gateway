CREATE UNIQUE INDEX idx_unique_tempo_historical_data ON t_tempo_historical_data(created_at);

DROP INDEX idx_tempo_historical_data_created_at;

