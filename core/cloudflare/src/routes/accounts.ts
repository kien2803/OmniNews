import { Hono } from 'hono';
import type { Context } from 'hono';
import { AccountsRepo } from '../repos/accounts';
import { ChannelPostsRepo } from '../repos/channelPosts';
import { ScheduledPostsRepo } from '../repos/scheduledPosts';
import { bearerUserId } from '../lib/auth';
import { usableAccessToken } from '../lib/tokens';
import { listChannelPosts } from '../lib/channelPosts';
import type { AccountRow, Platform, AccountStatus } from '../repos/types';
import type { Env } from '../env';

const PLATFORMS: readonly Platform[] = ['facebook', 'threads', 'reddit', 'x'];
const STATUSES: readonly AccountStatus[] = ['active', 'expired', 'revoked'];
const LANGUAGE_CODES = ['ENGLISH', 'VIETNAMESE'] as const;

export const accountRoutes = new Hono<{ Bindings: Env }>();


/** Wire shape — never includes tokens. `snapshot_at` matches the SPA type. */
function toWire(row: AccountRow) {
  return {
    id: row.id,
    platform: row.platform,
    external_id: row.external_id,
    display_name: row.display_name,
    status: row.status,
    created_at: row.created_at,
    metadata: {
      content_category: row.content_category ?? '',
      language_code: row.language_code ?? '',
      purpose: row.purpose ?? '',
      link: row.link ?? '',
    },
    channel: {
      channel_handle: row.channel_handle ?? '',
      avatar_url: row.avatar_url ?? '',
      subscribers: row.subscribers,
      views: row.views,
      video_count: row.video_count,
      like_count: row.like_count,
      avg_watch_seconds: row.avg_watch_seconds,
      drop_off_pct: row.drop_off_pct,
      snapshot_at: row.last_sync_at,
    },
  };
}

async function ownedAccount(
  c: Context<{ Bindings: Env }>,
  id: string,
): Promise<{ row: AccountRow } | { error: Response }> {
  const userId = await bearerUserId(c);
  if (!userId) return { error: c.json({ error: 'Unauthorized' }, 401) };
  const row = await new AccountsRepo(c.env.DB).findById(id);
  if (!row) return { error: c.json({ error: 'not_found' }, 404) };
  if (row.user_id !== userId) return { error: c.json({ error: 'account_not_owned' }, 403) };
  return { row };
}

accountRoutes.get('/accounts', async (c) => {
  const userId = await bearerUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const q = c.req.query();
  if (q.platform && !PLATFORMS.includes(q.platform as Platform)) {
    return c.json({ error: 'invalid_platform' }, 400);
  }
  if (q.status && !STATUSES.includes(q.status as AccountStatus)) {
    return c.json({ error: 'invalid_status' }, 400);
  }
  if (q.language && !(LANGUAGE_CODES as readonly string[]).includes(q.language)) {
    return c.json({ error: 'invalid_language_code' }, 400);
  }
  const limit = Math.min(Math.max(Number(q.limit) || 200, 1), 500);
  const offset = Math.max(Number(q.offset) || 0, 0);
  const filter = {
    userId,
    search: q.search || undefined,
    platform: q.platform as Platform | undefined,
    status: q.status as AccountStatus | undefined,
    contentCategory: q.content || undefined,
    languageCode: q.language || undefined,
    limit,
    offset,
  };
  const accounts = new AccountsRepo(c.env.DB);
  const [rows, total] = await Promise.all([accounts.list(filter), accounts.count(filter)]);
  return c.json({ accounts: rows.map(toWire), total });
});

accountRoutes.get('/analytics', async (c) => {
  const userId = await bearerUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const accountId = c.req.query('account_id') || undefined;
  const num = (v: string | undefined): number | undefined => {
    const n = Number(v);
    return v !== undefined && v !== '' && !Number.isNaN(n) ? n : undefined;
  };
  const rows = await new ScheduledPostsRepo(c.env.DB).analyticsByAccount(accountId, userId, {
    from: num(c.req.query('from')),
    to: num(c.req.query('to')),
  });
  return c.json({ rows });
});

accountRoutes.get('/accounts/:id', async (c) => {
  const r = await ownedAccount(c, c.req.param('id'));
  if ('error' in r) return r.error;
  return c.json(toWire(r.row));
});

accountRoutes.patch('/accounts/:id', async (c) => {
  const r = await ownedAccount(c, c.req.param('id'));
  if ('error' in r) return r.error;
  const body = (await c.req.json().catch(() => null)) as {
    display_name?: string;
    content_category?: string;
    language_code?: string;
    purpose?: string | null;
    link?: string | null;
    metadata?: { content_category?: string; language_code?: string; purpose?: string; link?: string };
  } | null;
  if (!body) return c.json({ error: 'invalid_body' }, 400);
  const accounts = new AccountsRepo(c.env.DB);

  if (body.display_name !== undefined) {
    const name = body.display_name.trim();
    if (!name) return c.json({ error: 'display_name_required' }, 400);
    if (name.length > 100) return c.json({ error: 'display_name_too_long' }, 400);
    await accounts.updateDisplayName(r.row.id, name);
  }

  // Accept flat fields (what the SPA sends) and the nested metadata shape.
  const meta = { ...(body.metadata ?? {}), ...body };
  if (meta.content_category !== undefined && (meta.content_category?.length ?? 0) > 64) {
    return c.json({ error: 'content_category_too_long' }, 400);
  }
  if (meta.language_code !== undefined && meta.language_code !== '') {
    if (!(LANGUAGE_CODES as readonly string[]).includes(meta.language_code)) {
      return c.json({ error: 'invalid_language_code' }, 400);
    }
  }
  if ((meta.purpose?.length ?? 0) > 500) return c.json({ error: 'purpose_too_long' }, 400);
  if ((meta.link?.length ?? 0) > 500) return c.json({ error: 'link_too_long' }, 400);
  await accounts.updateMetadata(r.row.id, {
    content_category: meta.content_category,
    language_code: meta.language_code,
    purpose: meta.purpose ?? undefined,
    link: meta.link ?? undefined,
  });

  return c.json(toWire((await accounts.findById(r.row.id))!));
});

accountRoutes.delete('/accounts/:id', async (c) => {
  const r = await ownedAccount(c, c.req.param('id'));
  if ('error' in r) return r.error;
  await new AccountsRepo(c.env.DB).deleteById(r.row.id);
  return c.json({ ok: true });
});

accountRoutes.get('/accounts/:id/stats', async (c) => {
  const r = await ownedAccount(c, c.req.param('id'));
  if ('error' in r) return r.error;
  const posts = new ScheduledPostsRepo(c.env.DB);
  const [byStatus, lastPublished] = await Promise.all([
    posts.countByStatusForAccount(r.row.id),
    posts.lastPublishedAt(undefined, r.row.id),
  ]);
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return c.json({ account_id: r.row.id, by_status: byStatus, total, last_published_at: lastPublished });
});

// Per-account post library: the synced copy of posts published on this
// platform account (FB feed posts, Threads, Reddit submissions, X tweets).
// Populated by POST .../posts/sync — the GET only reads the table, so the
// list is empty until the first sync runs.
accountRoutes.get('/accounts/:id/posts', async (c) => {
  const r = await ownedAccount(c, c.req.param('id'));
  if ('error' in r) return r.error;
  const lib = new ChannelPostsRepo(c.env.DB);
  const rows = await lib.listByAccount(r.row.id);
  const syncedAt = rows.length ? Math.max(...rows.map((v) => v.synced_at)) : null;
  return c.json({
    posts: rows.map((v) => ({
      id: v.external_id,
      title: v.title,
      thumbnail_url: v.thumbnail_url,
      published_at: v.published_at,
      view_count: v.view_count,
      like_count: v.like_count,
      comment_count: v.comment_count,
      url: v.url,
    })),
    synced_at: syncedAt,
  });
});

// Manual sync: pull the account's published posts from the platform and
// upsert them into channel_posts. Items the platform no longer returns
// (deleted/removed) are pruned by replaceForAccount.
accountRoutes.post('/accounts/:id/posts/sync', async (c) => {
  const r = await ownedAccount(c, c.req.param('id'));
  if ('error' in r) return r.error;
  if (!r.row.external_id) {
    return c.json({ error: 'account_missing_external_id' }, 400);
  }
  let token: string;
  try {
    token = await usableAccessToken(c.env, new AccountsRepo(c.env.DB), r.row);
  } catch {
    return c.json({ error: 'token_refresh_failed' }, 401);
  }
  let items;
  try {
    items = await listChannelPosts(c.env, r.row, token);
  } catch (e) {
    console.error('channel posts sync failed', e);
    return c.json({ error: 'posts_fetch_failed' }, 502);
  }
  const lib = new ChannelPostsRepo(c.env.DB);
  const syncedAt = Date.now();
  await lib.replaceForAccount(r.row, items, syncedAt);
  return c.json({ synced: items.length, synced_at: syncedAt });
});
