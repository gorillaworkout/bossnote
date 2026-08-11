-- BossNote schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('boss', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee_id TEXT NOT NULL REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  deadline TIMESTAMPTZ,
  voice_path TEXT,
  voice_duration INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_replies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  voice_path TEXT NOT NULL,
  voice_duration INTEGER,
  transcript TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ai_model TEXT NOT NULL DEFAULT 'ag/gemini-3-flash-agent'
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replies_task ON task_replies(task_id, created_at);

-- Seed default users (password: bossnote123)
INSERT INTO users (id, email, name, password_hash, role) VALUES
  ('boss-001', 'boss@bossnote.id', 'Boss', '$2b$10$RRqvPhkzece5ZEJP/Z5m1eHlBYqeVhaDvIRA2lVbMOnsl2ajRJmCa', 'boss'),
  ('bayu-001', 'bayu@bossnote.id', 'Bayu', '$2b$10$RRqvPhkzece5ZEJP/Z5m1eHlBYqeVhaDvIRA2lVbMOnsl2ajRJmCa', 'member')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_settings (user_id, ai_model) VALUES
  ('boss-001', 'ag/gemini-3-flash-agent'),
  ('bayu-001', 'ag/gemini-3-flash-agent')
ON CONFLICT (user_id) DO NOTHING;
