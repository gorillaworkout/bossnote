-- Add Prista (boss) and Sandra (member).
-- Ian + Prista are the bosses; Bayu + Sandra are staff.
-- Password for both new accounts: dupoin123 (bcryptjs, $2b$ prefix).
INSERT INTO users (id, email, name, password_hash, role) VALUES
  ('prista-001', 'prista@bossnote.id', 'Prista', '$2b$10$v6kwtBgxDKBU6tp0.hL55.zT6YOlHoe3rIrN3pRqzYGab3dXr.Bmi', 'boss'),
  ('sandra-001', 'sandra@bossnote.id', 'Sandra', '$2b$10$hbsLXWImRKf2Jgwgm9n8KuLcUpLjDRw0m1M5PskL.d.gXIn8z.KL6', 'member')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role;

INSERT INTO user_settings (user_id, ai_model) VALUES
  ('prista-001', 'ag/gemini-3-flash-agent'),
  ('sandra-001', 'ag/gemini-3-flash-agent')
ON CONFLICT (user_id) DO NOTHING;

-- Index for the 6-month cleanup job: fast lookup of done tasks by age.
CREATE INDEX IF NOT EXISTS idx_tasks_done_updated ON tasks(status, updated_at)
WHERE status = 'done';
