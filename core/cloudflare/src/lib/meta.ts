import type { Env } from '../env';

/** Minimal Meta Graph API readers — fetch-based, Workers-safe.
 *  Page access tokens stored on the account row authenticate both the
 *  Facebook Page edges and the linked Instagram Business account edges. */

const GRAPH_BASE = 'https://graph.facebook.com';

function apiVersion(env: Env): string {
  return env.META_API_VERSION || 'v24.0';
}

interface GraphError {
  error?: { code?: number; message?: string; type?: string };
}

async function graphGet<T>(env: Env, path: string, accessToken: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${apiVersion(env)}${path}`);
  url.searchParams.set('access_token', accessToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json = (await res.json()) as T & GraphError;
  if (!res.ok || json.error) {
    throw new Error(`meta_api: ${json.error?.code ?? res.status} ${json.error?.message ?? res.statusText}`.trim());
  }
  return json;
}

export interface FacebookReel {
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

/** Reels published on a Facebook Page — `/{page-id}/video_reels`.
 *  `views`/`like_count`/`comments_count` are requested opportunistically;
 *  Graph omits fields the token's permissions can't see, so missing
 *  stats land as null rather than failing the whole list. */
export async function listFacebookReels(pageId: string, accessToken: string, env: Env, limit = 25): Promise<FacebookReel[]> {
  const json = await graphGet<{ data?: FacebookReel[] }>(
    env,
    `/${pageId}/video_reels`,
    accessToken,
    {
      fields: 'id,description,created_time,length,permalink,views,like_count,comments_count,thumbnails',
      limit: String(limit),
    },
  );
  return json.data ?? [];
}

export interface InstagramMedia {
  id?: string;
  caption?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_product_type?: 'FEED' | 'REELS' | 'STORY' | 'AD';
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  // Insights-backed fields are not part of /media; views need a separate
  // insights call per item — skipped to keep this endpoint one request.
}

/** Reels (+ video posts) published on an Instagram Business account —
 *  `/{ig-user-id}/media` filtered to REELS/VIDEO client-side. */
export async function listInstagramReels(igUserId: string, accessToken: string, env: Env, limit = 25): Promise<InstagramMedia[]> {
  const json = await graphGet<{ data?: InstagramMedia[] }>(
    env,
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
