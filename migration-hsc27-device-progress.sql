-- Run ONCE against the existing Cloudflare D1 database.
-- HSC 27 progress will be stored separately for each device.
ALTER TABLE sessions ADD COLUMN device_hash TEXT;

CREATE TABLE IF NOT EXISTS device_progress (
  code_id TEXT NOT NULL REFERENCES access_codes(id),
  device_hash TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (code_id, device_hash)
);

CREATE INDEX IF NOT EXISTS idx_device_progress_code_id
ON device_progress(code_id);
