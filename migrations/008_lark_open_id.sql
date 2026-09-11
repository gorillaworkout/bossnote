-- Optional Lark open_id / user_id used to @mention the assignee in group notify.
-- Lookups still fall back to LARK_OPEN_IDS env and chat-member name match.
ALTER TABLE users ADD COLUMN IF NOT EXISTS lark_open_id TEXT;
