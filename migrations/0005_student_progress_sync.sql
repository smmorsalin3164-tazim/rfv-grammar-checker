-- Per-student progress identities and cross-device sync codes.
-- The sessions table already has device_hash in the deployed schema; profile_id is new.
ALTER TABLE sessions ADD COLUMN profile_id TEXT;

CREATE TABLE IF NOT EXISTS progress_profiles (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL REFERENCES access_codes(id),
  sync_code_hash TEXT NOT NULL UNIQUE,
  encrypted_sync_code TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_progress_profiles_code_id ON progress_profiles(code_id);

CREATE TABLE IF NOT EXISTS device_profiles (
  code_id TEXT NOT NULL REFERENCES access_codes(id),
  device_hash TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES progress_profiles(id),
  PRIMARY KEY(code_id, device_hash)
);

CREATE TABLE IF NOT EXISTS profile_progress (
  profile_id TEXT PRIMARY KEY REFERENCES progress_profiles(id),
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS device_progress (
  code_id TEXT NOT NULL REFERENCES access_codes(id),
  device_hash TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(code_id, device_hash)
);
