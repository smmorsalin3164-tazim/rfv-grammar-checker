CREATE TABLE IF NOT EXISTS access_codes (id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, code_id TEXT NOT NULL REFERENCES access_codes(id), expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_code_id ON sessions(code_id);
CREATE TABLE IF NOT EXISTS progress (code_id TEXT PRIMARY KEY REFERENCES access_codes(id), state_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
