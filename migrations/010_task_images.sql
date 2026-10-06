-- Several screenshots per task. image_path stays the first photo so list
-- cards and older clients keep working. image_paths is the full gallery,
-- oldest first. Files stay on disk under IMAGE_UPLOAD_DIR.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS image_paths JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE tasks
SET image_paths = jsonb_build_array(image_path)
WHERE image_path IS NOT NULL
  AND btrim(image_path) <> ''
  AND image_paths = '[]'::jsonb;
