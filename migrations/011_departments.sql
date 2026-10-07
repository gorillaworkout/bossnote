-- Departments live on the user. Tasks do not gain a department column.
-- Do not insert the admin user. Do not put a password or bcrypt hash in this file.

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO departments (id, name)
VALUES ('dept-general', 'General')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS department_id TEXT NULL REFERENCES departments(id) ON DELETE RESTRICT;

UPDATE users
SET department_id = 'dept-general'
WHERE role IN ('boss', 'member')
  AND department_id IS NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'boss', 'member'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_department_role_check;
ALTER TABLE users ADD CONSTRAINT users_department_role_check CHECK (
  (role = 'admin' AND department_id IS NULL)
  OR (role IN ('boss', 'member') AND department_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_lower_idx ON departments (LOWER(name));
