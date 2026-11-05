-- Pivot: video scheduling → article/post scheduling.
-- Articles are first-class library items (title + body + optional link and
-- image URLs) that get scheduled to text platforms (facebook, threads,
-- reddit, x). Video rows are left in `videos` for history but nothing new
-- references them.

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  -- JSON array of public image URLs ([]) — no binary storage needed.
  images TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_user ON articles(user_id, created_at DESC);

-- Rebuild scheduled_posts replacing video_id with article_id. SQLite can't
-- alter a column's FK, so the table is recreated and rows copied over.
-- comments.post_id is nulled first so dropping the parent table can't
-- violate its ON DELETE SET NULL constraint mid-migration.
UPDATE comments SET post_id = NULL WHERE post_id IS NOT NULL;

CREATE TABLE scheduled_posts_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id TEXT REFERENCES articles(id) ON DELETE SET NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  scheduled_at INTEGER NOT NULL,
  caption TEXT NOT NULL,
  per_platform_caption TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL DEFAULT 'pending',
  external_post_id TEXT,
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  is_dead INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO scheduled_posts_new
  (id, user_id, article_id, account_id, scheduled_at, caption, per_platform_caption,
   visibility, status, external_post_id, last_error, retry_count, next_retry_at,
   is_dead, notes, created_at, updated_at)
SELECT
  id, user_id, NULL, account_id, scheduled_at, caption, per_platform_caption,
  visibility, status, external_post_id, last_error, retry_count, next_retry_at,
  is_dead, notes, created_at, updated_at
FROM scheduled_posts;

-- Legacy rows have no article → nothing publishable remains. Anything not
-- already terminal is dead-lettered so the cron claim loop never picks it up.
UPDATE scheduled_posts_new
SET status = 'dead', is_dead = 1, last_error = 'legacy_video_post', updated_at = strftime('%s','now') * 1000
WHERE status IN ('draft', 'pending', 'uploading', 'failed');

DROP TABLE scheduled_posts;
ALTER TABLE scheduled_posts_new RENAME TO scheduled_posts;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_pending_due
  ON scheduled_posts(scheduled_at, next_retry_at)
  WHERE status = 'pending';

-- The synced per-account library now holds recent posts (any format), not
-- just videos. Same columns; duration_sec stays unused for text platforms.
ALTER TABLE channel_videos RENAME TO channel_posts;
DROP INDEX IF EXISTS idx_channel_videos_account_ext;
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_posts_account_ext ON channel_posts (account_id, external_id);
