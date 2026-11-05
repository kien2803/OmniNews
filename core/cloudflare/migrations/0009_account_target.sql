-- Per-account publish target: subreddit for reddit ('news' or 'r/news'),
-- reserved for future per-platform targets (FB group, X community).
ALTER TABLE accounts ADD COLUMN target TEXT NOT NULL DEFAULT '';
