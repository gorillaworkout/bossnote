-- Replace old seed with the requested credentials.
-- Ian = boss, Bayu = member. Password: dupoin123

DELETE FROM user_settings WHERE user_id IN ('boss-001','bayu-001');
DELETE FROM tasks WHERE created_by IN ('boss-001','bayu-001');
DELETE FROM users WHERE id IN ('boss-001','bayu-001');

INSERT INTO users (id, email, name, password_hash, role) VALUES
  ('boss-001', 'ian@bossnote.id', 'Ian', '$2b$10$eIqMPxJBlS24d0E9UvVJV.k9./zQF.3dAQqU2G6RzuOo2l5750GPC', 'boss'),
  ('bayu-001', 'bayu@bossnote.id', 'Bayu', '$2b$10$eqhYQJtHjo5Rl4S91oJCD.NV5I0TlEch4BvxlB3mfyYOVoEhFyhU2', 'member')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role;

INSERT INTO user_settings (user_id, ai_model) VALUES
  ('boss-001', 'ag/gemini-3-flash-agent'),
  ('bayu-001', 'ag/gemini-3-flash-agent')
ON CONFLICT (user_id) DO NOTHING;
