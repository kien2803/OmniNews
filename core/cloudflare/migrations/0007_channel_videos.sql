-- Per-account published-video library, populated by manual sync
-- (POST /accounts/:id/videos/sync). Mirrors sql.js migration 0013.
CREATE TABLE IF NOT EXISTS channel_videos (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  published_at INTEGER,
  duration_sec INTEGER,
  view_count INTEGER,
  like_count INTEGER,
  comment_count INTEGER,
  synced_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_videos_account_ext ON channel_videos (account_id, external_id);
