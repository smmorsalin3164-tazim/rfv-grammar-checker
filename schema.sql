CREATE TABLE IF NOT EXISTS access_codes (
  id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, encrypted_code TEXT, label TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, device_limit INTEGER NOT NULL DEFAULT 3
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, code_id TEXT NOT NULL REFERENCES access_codes(id), expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_code_id ON sessions(code_id);
CREATE TABLE IF NOT EXISTS progress (code_id TEXT PRIMARY KEY REFERENCES access_codes(id), state_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
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


CREATE TABLE IF NOT EXISTS registration_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mobile_last5 TEXT NOT NULL CHECK(length(mobile_last5)=5),
  registration_id TEXT NOT NULL,
  device_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
  access_code_id TEXT REFERENCES access_codes(id),
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_registration_requests_status_time ON registration_requests(status, created_at DESC);
