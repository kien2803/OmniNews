import type { AccountRow } from '@social-auto/shared';
import type { GoogleOAuthClient } from '../google/client.js';

/**
 * Wire shape for one synced library video — the same shape the Cloudflare
 * worker's lib/channelVideos.ts produces and the SPA's ChannelVideo type
 * consumes. Stats the platform API doesn't expose land as null.
 */
export interface ChannelVideoItem {
  id: string;
  title: string;
  thumbnail_url: string;
  published_at: number;
  duration_sec: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  url: string;
}

export type ChannelVideoLister = (
  account: Pick<AccountRow, 'platform' | 'external_id'>,
  accessToken: string,
  limit?: number,
) => Promise<ChannelVideoItem[]>;

const TIKTOK_VIDEO_LIST = 'https://open.tiktokapis.com/v2/video/list/';
const GRAPH_BASE = 'https://graph.facebook.com';

interface TiktokVideo {
  id?: string;
  title?: string;
  cover_image_url?: string;
  share_url?: string;
  create_time?: number;
  duration?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
}

/** Most recent videos on the creator account — requires the `video.list`
 *  scope (in DEFAULT_SCOPES; pre-existing connections need re-auth). */
async function listTiktokVideos(accessToken: string, maxCount: number): Promise<TiktokVideo[]> {
  const url = new URL(TIKTOK_VIDEO_LIST);
  url.searchParams.set(
    'fields',
    'id,title,cover_image_url,share_url,create_time,duration,view_count,like_count,comment_count',
  );
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ max_count: maxCount }),
  });
  const json = (await res.json()) as {
    data?: { videos?: TiktokVideo[] };
    error?: { code?: string; message?: string };
  };
  if (!res.ok || (json.error && json.error.code !== 'ok')) {
    const code = json.error?.code ?? `http_${res.status}`;
    throw new Error(`tiktok_video_list: ${code} ${json.error?.message ?? ''}`.trim());
  }
  return json.data?.videos ?? [];
}

interface GraphError {
  error?: { code?: number; message?: string };
}

async function graphGet<T>(apiVersion: string, path: string, accessToken: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${apiVersion}${path}`);
  url.searchParams.set('access_token', accessToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json = (await res.json()) as T & GraphError;
  if (!res.ok || json.error) {
    throw new Error(`meta_api: ${json.error?.code ?? res.status} ${json.error?.message ?? res.statusText}`.trim());
  }
  return json;
}

interface FacebookReel {
  id?: string;
  description?: string;
  created_time?: string;
  length?: number;
  permalink?: string;
  views?: number;
  like_count?: number;
  comments_count?: number;
  thumbnails?: { data?: Array<{ uri?: string; is_preferred?: boolean }> };
}

/** Reels published on a Facebook Page — `/{page-id}/video_reels`. Stats are
 *  requested opportunistically; Graph omits fields the token can't see. */
async function listFacebookReels(pageId: string, accessToken: string, apiVersion: string, limit: number): Promise<FacebookReel[]> {
  const json = await graphGet<{ data?: FacebookReel[] }>(
    apiVersion,
    `/${pageId}/video_reels`,
    accessToken,
    {
      fields: 'id,description,created_time,length,permalink,views,like_count,comments_count,thumbnails',
      limit: String(limit),
    },
  );
  return json.data ?? [];
}

interface InstagramMedia {
  id?: string;
  caption?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_product_type?: 'FEED' | 'REELS' | 'STORY' | 'AD';
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

/** Reels (+ video posts) on an Instagram Business account — `/{ig-user-id}/media`
 *  filtered to REELS/VIDEO client-side. */
async function listInstagramReels(igUserId: string, accessToken: string, apiVersion: string, limit: number): Promise<InstagramMedia[]> {
  const json = await graphGet<{ data?: InstagramMedia[] }>(
    apiVersion,
    `/${igUserId}/media`,
    accessToken,
    {
      fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp,like_count,comments_count',
      limit: String(Math.min(limit * 2, 100)), // over-fetch — some rows filter out
    },
  );
  const reels = (json.data ?? []).filter(
    (m) => m.media_product_type === 'REELS' || (m.media_product_type == null && m.media_type === 'VIDEO'),
  );
  return reels.slice(0, limit);
}

/**
 * Build the dispatcher used by POST /accounts/:id/videos/sync. Injectable
 * via route deps so tests can stub the platform calls.
 */
export function createChannelVideoLister(deps: {
  google?: GoogleOAuthClient;
  metaApiVersion?: string;
}): ChannelVideoLister {
  const graphVersion = deps.metaApiVersion || 'v24.0';
  return async (account, accessToken, limit = 20) => {
    switch (account.platform) {
      case 'youtube': {
        if (!deps.google?.listRecentVideos) throw new Error('youtube_listing_unavailable');
        const videos = await deps.google.listRecentVideos(accessToken, account.external_id, limit);
        return videos.map((v) => ({
          id: v.id,
          title: v.title,
          thumbnail_url: v.thumbnail_url,
          published_at: v.published_at,
          duration_sec: v.duration_sec,
          view_count: v.view_count,
          like_count: v.like_count,
          comment_count: v.comment_count,
          url: `https://youtube.com/watch?v=${v.id}`,
        }));
      }
      case 'tiktok': {
        const videos = await listTiktokVideos(accessToken, limit);
        return videos.map((v) => ({
          id: v.id ?? '',
          title: v.title ?? '',
          thumbnail_url: v.cover_image_url ?? '',
          published_at: v.create_time ? v.create_time * 1000 : 0,
          duration_sec: v.duration ?? null,
          view_count: v.view_count ?? null,
          like_count: v.like_count ?? null,
          comment_count: v.comment_count ?? null,
          url: v.share_url ?? `https://tiktok.com/@me/video/${v.id ?? ''}`,
        }));
      }
      case 'facebook': {
        const reels = await listFacebookReels(account.external_id, accessToken, graphVersion, limit);
        return reels.map((r) => ({
          id: r.id ?? '',
          title: r.description ?? '',
          thumbnail_url:
            r.thumbnails?.data?.find((t) => t.is_preferred)?.uri ?? r.thumbnails?.data?.[0]?.uri ?? '',
          published_at: r.created_time ? Date.parse(r.created_time) : 0,
          duration_sec: r.length != null ? Math.round(r.length) : null,
          view_count: r.views ?? null,
          like_count: r.like_count ?? null,
          comment_count: r.comments_count ?? null,
          url: r.permalink ?? `https://facebook.com/reel/${r.id ?? ''}`,
        }));
      }
      case 'instagram': {
        const media = await listInstagramReels(account.external_id, accessToken, graphVersion, limit);
        return media.map((m) => ({
          id: m.id ?? '',
          title: m.caption ?? '',
          thumbnail_url: m.thumbnail_url ?? '',
          published_at: m.timestamp ? Date.parse(m.timestamp) : 0,
          duration_sec: null,
          view_count: null,
          like_count: m.like_count ?? null,
          comment_count: m.comments_count ?? null,
          url: m.permalink ?? `https://instagram.com/reel/${m.id ?? ''}`,
        }));
      }
    }
  };
}
