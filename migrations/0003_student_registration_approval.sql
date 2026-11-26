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