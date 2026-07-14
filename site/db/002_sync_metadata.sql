ALTER TABLE calendar_sync_status
  ADD COLUMN IF NOT EXISTS imported_blocks INTEGER,
  ADD COLUMN IF NOT EXISTS feed_count INTEGER;
