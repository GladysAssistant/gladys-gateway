-- The primary key of t_gladys_usage was a random UUID (v4): every insert landed on a random
-- leaf page of a large index, which had to be read from disk once the cache was evicted
-- (38 ms per insert on average, up to 10 s). A UUID v7 starts with a timestamp: the new rows
-- all go to the same few pages of the index, which stay in cache. uuidv7() is native since
-- PostgreSQL 18. The existing ids are kept, only the default of the new rows changes.
ALTER TABLE t_gladys_usage ALTER COLUMN id SET DEFAULT uuidv7();
