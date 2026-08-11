-- Structured task fields extracted from voice notes
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deliverables JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_error TEXT;

-- Backfill: old rows kept their raw transcript in description.
UPDATE tasks SET transcript = description
WHERE transcript IS NULL AND description IS NOT NULL
  AND description <> 'Voice note attached. AI transcription unavailable.';
