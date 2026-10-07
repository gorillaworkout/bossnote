-- Lark login. Does not insert users, passwords, open ids, or a tenant key.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_provider_check;
ALTER TABLE users ADD CONSTRAINT users_auth_provider_check
  CHECK (auth_provider IN ('password', 'lark'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS lark_email TEXT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_department_role_check;
ALTER TABLE users ADD CONSTRAINT users_department_role_check CHECK (
  (role = 'admin' AND department_id IS NULL)
  OR (role = 'boss' AND department_id IS NOT NULL)
  OR (role = 'member')
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_admin_password_only_check;
ALTER TABLE users ADD CONSTRAINT users_admin_password_only_check
  CHECK (role <> 'admin' OR auth_provider = 'password');

CREATE UNIQUE INDEX IF NOT EXISTS users_lark_login_open_id_idx
  ON users (lark_open_id)
  WHERE auth_provider = 'lark' AND lark_open_id IS NOT NULL;
