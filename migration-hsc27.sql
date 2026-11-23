-- Run this ONCE against the existing Cloudflare D1 database.
ALTER TABLE access_codes ADD COLUMN device_limit INTEGER NOT NULL DEFAULT 3;
CREATE TABLE IF NOT EXISTS device_activations (
  id TEXT PRIMARY KEY, code_id TEXT NOT NULL REFERENCES access_codes(id), device_hash TEXT NOT NULL,
  activated_at INTEGER NOT NULL, UNIQUE(code_id, device_hash)
);
CREATE INDEX IF NOT EXISTS idx_device_activations_code_id ON device_activations(code_id);
CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY, code_id TEXT NOT NULL REFERENCES access_codes(id), device_hash TEXT NOT NULL,
  attempted_at INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('success', 'blocked'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_code_time ON login_attempts(code_id, attempted_at DESC);
