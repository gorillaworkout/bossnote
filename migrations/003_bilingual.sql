-- answered_questions: 0-indexed positions the boss has addressed via voice reply.
-- Staff sees only unanswered ones; boss always sees all with checkmarks.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS answered_questions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Bilingual: the boss speaks any language. The original field stays in their
-- language. The _id suffix carries the Indonesian translation for staff.
-- (id = Indonesian, not "identifier")
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS transcript_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS summary_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS steps_id JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deliverables_id JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS questions_id JSONB NOT NULL DEFAULT '[]'::jsonb;
