import type { Env } from '../env';

/** Minimal TikTok Content Posting / OAuth client — fetch-based, Workers-safe. */

const TIKTOK_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_VIDEO_LIST = 'https://open.tiktokapis.com/v2/video/list/';

export interface TiktokTokens {
  access_token: string;
  /** TikTok rotates refresh tokens on every refresh — the new value must
   *  be persisted or the account loses access on the next expiry. */
  refresh_token?: string;
  expires_at: number;
}

/** Exchange a TikTok refresh_token for a new access token (Login Kit v2). */
export async function refreshTiktokAccessToken(env: Env, refreshToken: string): Promise<TiktokTokens> {
  const res = await fetch(TIKTOK_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY ?? '',
      client_secret: env.TIKTOK_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`token_refresh_failed: ${data.error_description ?? data.error ?? res.status}`);
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 86_400) * 1000,
  };
}

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

interface TiktokVideoListResponse {
  data?: { videos?: TiktokVideo[]; has_more?: boolean; cursor?: number };
  error?: { code?: string; message?: string };
}

/** Most recent videos on the creator account — requires the `video.list`
 *  scope (added to TIKTOK_SCOPES; pre-existing connections need re-auth). */
export async function listTiktokVideos(accessToken: string, maxCount = 20): Promise<TiktokVideo[]> {
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
  const json = (await res.json()) as TiktokVideoListResponse;
  if (!res.ok || (json.error && json.error.code !== 'ok')) {
    const code = json.error?.code ?? `http_${res.status}`;
    throw new Error(`tiktok_video_list: ${code} ${json.error?.message ?? ''}`.trim());
  }
  return json.data?.videos ?? [];
}
