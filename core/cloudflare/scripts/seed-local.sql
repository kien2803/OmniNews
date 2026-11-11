-- Local dev seed: one mock desk per platform for the first registered user.
-- With MOCK_PUBLISHERS=true these publish without real OAuth credentials.
-- Run: pnpm db:seed:local   (from core/cloudflare)

INSERT OR IGNORE INTO accounts
  (id, user_id, platform, external_id, display_name, oauth_refresh_token, status, created_at, target)
SELECT 'acc_facebook', (SELECT id FROM users LIMIT 1), 'facebook', 'ext_fb',
       'Mock Facebook desk', 'mock', 'active', strftime('%s','now')*1000, ''
UNION ALL
SELECT 'acc_threads', (SELECT id FROM users LIMIT 1), 'threads', 'ext_th',
       'Mock Threads desk', 'mock', 'active', strftime('%s','now')*1000, ''
UNION ALL
SELECT 'acc_reddit', (SELECT id FROM users LIMIT 1), 'reddit', 'ext_rd',
       'Mock Reddit desk', 'mock', 'active', strftime('%s','now')*1000, 'testsub'
UNION ALL
SELECT 'acc_x', (SELECT id FROM users LIMIT 1), 'x', 'ext_x',
       'Mock X desk', 'mock', 'active', strftime('%s','now')*1000, '';
