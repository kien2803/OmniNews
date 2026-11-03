CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES scheduled_posts(id) ON DELETE SET NULL,
  external_post_id TEXT NOT NULL,
  external_comment_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  commented_at INTEGER NOT NULL,
  reply_text TEXT,
  reply_status TEXT NOT NULL DEFAULT 'none',
  replied_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(platform, external_comment_id)
);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id, commented_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_account ON comments(account_id);

ALTER TABLE accounts ADD COLUMN auto_reply_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN auto_reply_template TEXT;
