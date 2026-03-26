CREATE TABLE IF NOT EXISTS allowed_users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user',
  name TEXT
);

CREATE INDEX IF NOT EXISTS idx_allowed_users_role
ON allowed_users(role);
