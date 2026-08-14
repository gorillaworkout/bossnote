-- 'waiting' status: task is blocked waiting for boss input, not really
-- "in progress" since the staff can't advance it unilaterally.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'waiting', 'done'));
