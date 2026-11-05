import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  AccountChannelSnapshot,
  AccountLanguageCode,
  AccountMetadata,
  AccountRow,
  Platform,
} from '@social-auto/shared';
import { ACCOUNT_LANGUAGE_CODES, isPlatform } from '@social-auto/shared';
import { decrypt, encrypt } from '@social-auto/shared/utils/crypto.js';
import type { ChannelInfo, GoogleOAuthClient } from '../google/client.js';
import type { TiktokOAuthClient } from '../tiktok/client.js';
import type { AccountsRepo } from '../repositories/accounts.js';
import type { ChannelVideosRepo } from '../repositories/channelVideos.js';
import { createChannelVideoLister, type ChannelVideoLister } from '../lib/channelVideos.js';
import type { ScheduledPostsRepo } from '../repositories/scheduledPosts.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export interface AccountsDeps {
  accounts: AccountsRepo;
  posts: ScheduledPostsRepo;
  channelVideos: ChannelVideosRepo;
  google?: GoogleOAuthClient;
  tiktok?: TiktokOAuthClient;
  metaApiVersion?: string;
  /** Test seam — defaults to the real platform dispatcher. */
  listChannelVideos?: ChannelVideoLister;
  tokenEncryptionKey?: string;
  authMiddleware: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

/** Decrypt the account's access token, refreshing via its refresh token when
 *  expired. Mirrors the Cloudflare worker's lib/tokens.ts per-platform rules:
 *  youtube — Google refresh grant; tiktok — Login Kit refresh with ROTATING
 *  refresh token (persisted alongside); meta — no refresh grant, throws so the
 *  caller surfaces 'reconnect'. Throws on any failure. */
async function usableAccessToken(deps: AccountsDeps, row: AccountRow): Promise<string> {
  const key = deps.tokenEncryptionKey;
  if (!key) throw new Error('token_refresh_failed: no encryption key');
  if (row.oauth_access_token && row.token_expires_at && row.token_expires_at > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    try {
      return decrypt(row.oauth_access_token, key);
    } catch {
      /* fall through to refresh */
    }
  }
  // A stored access token with no recorded expiry — Meta rows created
  // before token_expires_at was tracked. Use it until the API says no.
  if (row.oauth_access_token && !row.token_expires_at) {
    try {
      return decrypt(row.oauth_access_token, key);
    } catch {
      /* fall through */
    }
  }
  const refresh = decrypt(row.oauth_refresh_token, key);
  if (row.platform === 'youtube') {
    if (!deps.google) throw new Error('token_refresh_failed: google client unavailable');
    const tokens = await deps.google.refresh(refresh);
    deps.accounts.updateTokens(row.id, {
      access_token: encrypt(tokens.access_token, key),
      expires_at: tokens.expires_at,
    });
    return tokens.access_token;
  }
  if (row.platform === 'tiktok') {
    if (!deps.tiktok) throw new Error('token_refresh_failed: tiktok client unavailable');
    const tokens = await deps.tiktok.refresh(refresh);
    deps.accounts.updateTokens(row.id, {
      access_token: encrypt(tokens.access_token, key),
      refresh_token: encrypt(tokens.refresh_token, key),
      expires_at: tokens.expires_at,
    });
    return tokens.access_token;
  }
  throw new Error('token_refresh_failed: meta token expired — reconnect account');
}

/** Wire shape for an account row returned by the API. Never includes tokens. */
interface AccountWire {
  id: string;
  platform: Platform;
  external_id: string;
  display_name: string;
  status: AccountRow['status'];
  created_at: number;
  metadata: AccountMetadata;
  channel: AccountChannelSnapshot;
}

function toWire(row: AccountRow): AccountWire {
  return {
    id: row.id,
    platform: row.platform,
    external_id: row.external_id,
    display_name: row.display_name,
    status: row.status,
    created_at: row.created_at,
    metadata: {
      content_category: row.content_category,
      language_code: row.language_code as AccountLanguageCode,
      purpose: row.purpose,
      link: row.link,
    },
    channel: {
      channel_handle: row.channel_handle,
      avatar_url: row.avatar_url,
      subscribers: row.subscribers,
      views: row.views,
      video_count: row.video_count,
      like_count: row.like_count,
      avg_watch_seconds: row.avg_watch_seconds,
      drop_off_pct: row.drop_off_pct,
      last_sync_at: row.last_sync_at,
    },
  };
}

function toSnapshot(info: ChannelInfo): AccountChannelSnapshot {
  return {
    channel_handle: info.handle ?? '',
    avatar_url: info.thumbnail_url ?? '',
    subscribers: info.subscribers,
    views: info.views,
    video_count: info.video_count,
    // The Data API v3 channels.list?part=statistics does not return like
    // count for the channel (only subscriber/view/video counts). Per-video
    // likes would require a separate videos.list call; we leave the field
    // null until a future enrichment pass populates it. avg_watch_seconds
    // and drop_off_pct require the YouTube Analytics API which is gated
    // behind `youtube.analytics.readonly` — also null until that scope is
    // added and re-authorization completes.
    like_count: null,
    avg_watch_seconds: null,
    drop_off_pct: null,
    last_sync_at: info.snapshot_at,
  };
}

export function registerAccountRoutes(
  app: FastifyInstance,
  deps: AccountsDeps,
): void {
  // GET /accounts — list with safe filters.
  app.get<{
    Querystring: {
      search?: string;
      platform?: string;
      status?: string;
      content_category?: string;
      language_code?: string;
    };
  }>('/accounts', { preHandler: deps.authMiddleware }, async (req, reply) => {
    const q = req.query;
    if (q.platform && !isPlatform(q.platform)) {
      return reply.code(400).send({ error: 'invalid_platform' });
    }
    if (q.status && !['active', 'expired', 'revoked'].includes(q.status)) {
      return reply.code(400).send({ error: 'invalid_status' });
    }
    if (
      q.language_code &&
      q.language_code !== '' &&
      !(ACCOUNT_LANGUAGE_CODES as readonly string[]).includes(q.language_code)
    ) {
      return reply.code(400).send({ error: 'invalid_language_code' });
    }
    const userId = (req as AuthenticatedRequest).userId;
    const rows = deps.accounts.listSlim({
      userId,
      search: q.search,
      platform: q.platform as Platform | undefined,
      status: q.status as AccountRow['status'] | undefined,
      contentCategory: q.content_category,
      languageCode: q.language_code as AccountLanguageCode | undefined,
    });
    return { accounts: rows.map(toWire) };
  });

  // GET /analytics — unchanged.
  app.get<{ Querystring: { account_id?: string } }>(
    '/analytics',
    { preHandler: deps.authMiddleware },
    async (req) => {
      const accountId =
        typeof req.query.account_id === 'string' && req.query.account_id
          ? req.query.account_id
          : undefined;
      const userId = (req as AuthenticatedRequest).userId;
      const rows = deps.posts.analyticsByAccount(accountId, userId);
      return { rows };
    },
  );

  // GET /accounts/:id — single account detail (was missing; the UI had to
  // filter the list client-side).
  app.get<{ Params: { id: string } }>('/accounts/:id', { preHandler: deps.authMiddleware }, async (req, reply) => {
    const userId = (req as AuthenticatedRequest).userId;
    const existing = deps.accounts.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    if (existing.user_id !== userId) {
      return reply.code(403).send({ error: 'account_not_owned' });
    }
    return toWire(existing);
  });

  // PATCH /accounts/:id — accept metadata + display_name.
  app.patch<{
    Params: { id: string };
    Body: {
      display_name?: string;
      metadata?: Partial<AccountMetadata>;
    };
  }>('/accounts/:id', { preHandler: deps.authMiddleware }, async (req, reply) => {
    const userId = (req as AuthenticatedRequest).userId;
    const existing = deps.accounts.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    if (existing.user_id !== userId) {
      return reply.code(403).send({ error: 'account_not_owned' });
    }
    const body = req.body ?? {};
    if (body.display_name !== undefined) {
      const name = body.display_name.trim();
      if (!name) return reply.code(400).send({ error: 'display_name_required' });
      if (name.length > 100) return reply.code(400).send({ error: 'display_name_too_long' });
      deps.accounts.updateDisplayName(req.params.id, name);
    }
    if (body.metadata) {
      const meta = body.metadata;
      if (meta.content_category !== undefined && meta.content_category.length > 64) {
        return reply.code(400).send({ error: 'content_category_too_long' });
      }
      if (meta.language_code !== undefined && meta.language_code !== '') {
        if (!(ACCOUNT_LANGUAGE_CODES as readonly string[]).includes(meta.language_code)) {
          return reply.code(400).send({ error: 'invalid_language_code' });
        }
      }
      if (meta.purpose !== undefined && meta.purpose.length > 500) {
        return reply.code(400).send({ error: 'purpose_too_long' });
      }
      if (meta.link !== undefined && meta.link.length > 500) {
        return reply.code(400).send({ error: 'link_too_long' });
      }
      deps.accounts.updateMetadata(req.params.id, {
        content_category: meta.content_category ?? undefined,
        language_code: meta.language_code ?? undefined,
        purpose: meta.purpose ?? undefined,
        link: meta.link ?? undefined,
      });
    }
    const updated = deps.accounts.findById(req.params.id);
    return toWire(updated!);
  });

  // DELETE /accounts/:id — unchanged.
  app.delete<{ Params: { id: string } }>('/accounts/:id', { preHandler: deps.authMiddleware }, async (req, reply) => {
    const userId = (req as AuthenticatedRequest).userId;
    const existing = deps.accounts.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    if (existing.user_id !== userId) {
      return reply.code(403).send({ error: 'account_not_owned' });
    }
    deps.accounts.deleteById(req.params.id);
    return { ok: true };
  });

  // GET /accounts/:id/stats — per-account scheduled-post counts.
  app.get<{ Params: { id: string } }>('/accounts/:id/stats', { preHandler: deps.authMiddleware }, async (req, reply) => {
    const userId = (req as AuthenticatedRequest).userId;
    const existing = deps.accounts.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    if (existing.user_id !== userId) {
      return reply.code(403).send({ error: 'account_not_owned' });
    }
    return deps.posts.countByStatusForAccount(req.params.id);
  });

  // GET /accounts/:id/videos — the synced copy of videos published on this
  // platform account. Populated by POST .../videos/sync; the GET only reads
  // the table, so the list is empty until the first sync runs.
  app.get<{ Params: { id: string } }>('/accounts/:id/videos', { preHandler: deps.authMiddleware }, async (req, reply) => {
    const userId = (req as AuthenticatedRequest).userId;
    const existing = deps.accounts.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    if (existing.user_id !== userId) {
      return reply.code(403).send({ error: 'account_not_owned' });
    }
    const rows = deps.channelVideos.listByAccount(existing.id);
    const syncedAt = rows.length ? Math.max(...rows.map((v) => v.synced_at)) : null;
    return {
      videos: rows.map((v) => ({
        id: v.external_id,
        title: v.title,
        thumbnail_url: v.thumbnail_url,
        published_at: v.published_at,
        duration_sec: v.duration_sec,
        view_count: v.view_count,
        like_count: v.like_count,
        comment_count: v.comment_count,
        url: v.url,
      })),
      synced_at: syncedAt,
    };
  });

  // POST /accounts/:id/videos/sync — pull the account's published videos
  // from the platform and upsert them into channel_videos. Items the
  // platform no longer returns are pruned by replaceForAccount.
  app.post<{ Params: { id: string } }>('/accounts/:id/videos/sync', { preHandler: deps.authMiddleware }, async (req, reply) => {
    const userId = (req as AuthenticatedRequest).userId;
    const existing = deps.accounts.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    if (existing.user_id !== userId) {
      return reply.code(403).send({ error: 'account_not_owned' });
    }
    if (!existing.external_id && existing.platform !== 'tiktok') {
      return reply.code(400).send({ error: 'account_missing_external_id' });
    }
    let token: string;
    try {
      token = await usableAccessToken(deps, existing);
    } catch {
      return reply.code(401).send({ error: 'token_refresh_failed' });
    }
    const lister =
      deps.listChannelVideos ??
      createChannelVideoLister({ google: deps.google, metaApiVersion: deps.metaApiVersion });
    let items;
    try {
      items = await lister(existing, token);
    } catch {
      return reply.code(502).send({ error: 'videos_fetch_failed' });
    }
    const syncedAt = Date.now();
    deps.channelVideos.replaceForAccount(existing, items, syncedAt);
    return { synced: items.length, synced_at: syncedAt };
  });

  // POST /accounts/:id/sync — refresh the YouTube channel snapshot.
  app.post<{ Params: { id: string } }>('/accounts/:id/sync', { preHandler: deps.authMiddleware }, async (req, reply) => {
    if (!deps.google || !deps.tokenEncryptionKey) {
      return reply.code(503).send({ error: 'sync_unavailable' });
    }
    const userId = (req as AuthenticatedRequest).userId;
    const existing = deps.accounts.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    if (existing.user_id !== userId) {
      return reply.code(403).send({ error: 'account_not_owned' });
    }
    if (existing.platform !== 'youtube') {
      return reply.code(400).send({ error: 'sync_only_youtube' });
    }
    let decryptedAccess: string | null = null;
    try {
      decryptedAccess = existing.oauth_access_token
        ? decrypt(existing.oauth_access_token, deps.tokenEncryptionKey)
        : null;
    } catch {
      return reply.code(401).send({ error: 'token_decrypt_failed' });
    }
    if (!decryptedAccess) {
      // Try refresh.
      try {
        const decryptedRefresh = decrypt(existing.oauth_refresh_token, deps.tokenEncryptionKey);
        const tokens = await deps.google.refresh(decryptedRefresh);

        deps.accounts.updateTokens(existing.id, {
          access_token: encrypt(tokens.access_token, deps.tokenEncryptionKey),
          expires_at: tokens.expires_at,
        });
        decryptedAccess = tokens.access_token;
      } catch {
        return reply.code(401).send({ error: 'token_refresh_failed' });
      }
    }
    let info: ChannelInfo;
    try {
      info = await deps.google.getMyChannel(decryptedAccess);
    } catch {
      return reply.code(502).send({ error: 'google_api_error' });
    }
    const snapshot = toSnapshot(info);
    // Real YouTube only: pull the channel's recent uploads and sum the
    // like_count across them so the Analytics page can show a "channel
    // likes" number derived from real per-video stats. The Data API v3
    // doesn't expose channel-wide like_count, only per-video, so this is
    // the cheapest approximation. avg_watch_seconds + drop_off_pct remain
    // null until the Analytics API scope lands. Mock path returns the same
    // deterministic seed so the UI is exercised end-to-end.
    if (deps.google.listRecentVideos && existing.external_id) {
      try {
        const videos = await deps.google.listRecentVideos(
          decryptedAccess,
          existing.external_id,
        );
        const summed = videos.reduce(
          (acc, v) => acc + (v.like_count ?? 0),
          0,
        );
        if (videos.length > 0) snapshot.like_count = summed;
      } catch {
        // Non-fatal — like count is a nice-to-have; the rest of the
        // snapshot still applies if the videos call fails (e.g. quota).
      }
    }
    deps.accounts.updateChannelSnapshot(existing.id, snapshot);
    return { id: existing.id, channel: snapshot };
  });
}
