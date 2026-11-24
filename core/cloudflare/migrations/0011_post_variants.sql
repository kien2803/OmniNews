-- Per-account content variants for a scheduled post. NULL → legacy
-- behaviour (caption, then article title+body) — backwards compatible.
ALTER TABLE scheduled_posts ADD COLUMN variant TEXT;
