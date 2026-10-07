-- Optional Lark open_id / user_id used to @mention and DM the assignee.
-- Lookup order: this column, LARK_OPEN_IDS, Dupoin email via contact batch_get_id, then chat-member name match.
-- Do not commit real open_ids. Set them in Manage Users or in LARK_OPEN_IDS on the server.
ALTER TABLE users ADD COLUMN IF NOT EXISTS lark_open_id TEXT;
