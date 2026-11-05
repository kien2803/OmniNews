import type { Env } from '../env';
import type { AccountRow } from '../repos/types';
import { listRecentVideos } from './google';
import { listTiktokVideos } from './tiktok';
import { listFacebookReels, listInstagramReels } from './meta';

/** Wire shape for GET /accounts/:id/videos — mirrors the SPA's ChannelVideo.
 *  Every platform maps onto the same fields; stats the platform API
 *  doesn't expose land as null (UI renders "—"). */
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

/** Fetch the account's most recent published videos from its platform.
 *  `external_id` semantics per platform: YouTube channel id, TikTok open_id
 *  (unused — the token identifies the user), Facebook Page id, IG Business
 *  account id. Throws on token/API failure — the route maps the error. */
export async function listChannelVideos(
  env: Env,
  account: Pick<AccountRow, 'platform' | 'external_id'>,
  accessToken: string,
  limit = 20,
): Promise<ChannelVideoItem[]> {
  switch (account.platform) {
    case 'youtube': {
      const videos = await listRecentVideos(accessToken, account.external_id, limit);
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
      const reels = await listFacebookReels(account.external_id, accessToken, env, limit);
      return reels.map((r) => ({
        id: r.id ?? '',
        title: r.description ?? '',
        thumbnail_url: r.thumbnails?.data?.find((t) => t.is_preferred)?.uri ?? r.thumbnails?.data?.[0]?.uri ?? '',
        published_at: r.created_time ? Date.parse(r.created_time) : 0,
        duration_sec: r.length != null ? Math.round(r.length) : null,
        view_count: r.views ?? null,
        like_count: r.like_count ?? null,
        comment_count: r.comments_count ?? null,
        url: r.permalink ?? `https://facebook.com/reel/${r.id ?? ''}`,
      }));
    }
    case 'instagram': {
      const media = await listInstagramReels(account.external_id, accessToken, env, limit);
      return media.map((m) => ({
        id: m.id ?? '',
        title: m.caption ?? '',
        thumbnail_url: m.thumbnail_url ?? '',
        published_at: m.timestamp ? Date.parse(m.timestamp) : 0,
        duration_sec: null, // /media doesn't return duration; needs per-item insights call
        view_count: null,
        like_count: m.like_count ?? null,
        comment_count: m.comments_count ?? null,
        url: m.permalink ?? `https://instagram.com/reel/${m.id ?? ''}`,
      }));
    }
  }
}
