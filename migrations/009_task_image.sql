-- Optional screenshot on a task. Bosses need the photo to understand the bug.
-- Files live on disk (IMAGE_UPLOAD_DIR); this column stores the app URL.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS image_path TEXT;
