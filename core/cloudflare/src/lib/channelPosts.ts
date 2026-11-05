import type { Env } from '../env';
import type { AccountRow } from '../repos/types';
import { listFacebookPosts } from './meta';

/** Wire shape for GET /accounts/:id/posts — mirrors the SPA's ChannelPost.
 *  Every platform maps onto the same fields; stats the platform API
 *  doesn't expose land as null (UI renders "—"). */
export interface ChannelPostItem {
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

/** Fetch the account's most recent published posts from its platform.
 *  `external_id` semantics per platform: Facebook Page id, Threads user id,
 *  Reddit username (channel_handle), X user id. Throws on token/API
 *  failure — the route maps the error. */
export async function listChannelPosts(
  env: Env,
  account: Pick<AccountRow, 'platform' | 'external_id' | 'channel_handle'>,
  accessToken: string,
  limit = 20,
): Promise<ChannelPostItem[]> {
  switch (account.platform) {
    case 'facebook': {
      const posts = await listFacebookPosts(account.external_id, accessToken, env, limit);
      return posts.map((p) => ({
        id: p.id ?? '',
        title: p.message ?? '',
        thumbnail_url: p.full_picture ?? '',
        published_at: p.created_time ? Date.parse(p.created_time) : 0,
        duration_sec: null,
        view_count: null,
        like_count: p.reactions?.summary?.total_count ?? null,
        comment_count: p.comments?.summary?.total_count ?? null,
        url: p.permalink_url ?? '',
      }));
    }
    case 'threads': {
      const u = new URL(`https://graph.threads.net/v1.0/${account.external_id}/threads`);
      u.searchParams.set('fields', 'id,text,timestamp,permalink');
      u.searchParams.set('limit', String(limit));
      u.searchParams.set('access_token', accessToken);
      const res = await fetch(u);
      if (!res.ok) throw new Error(`threads_api: ${res.status}`);
      const json = (await res.json()) as {
        data?: Array<{ id?: string; text?: string; timestamp?: string; permalink?: string }>;
      };
      return (json.data ?? []).map((t) => ({
        id: t.id ?? '',
        title: t.text ?? '',
        thumbnail_url: '',
        published_at: t.timestamp ? Date.parse(t.timestamp) : 0,
        duration_sec: null,
        view_count: null,
        like_count: null,
        comment_count: null,
        url: t.permalink ?? '',
      }));
    }
    case 'reddit': {
      const name = account.channel_handle || account.external_id;
      const res = await fetch(`https://oauth.reddit.com/user/${encodeURIComponent(name)}/submitted?limit=${limit}`, {
        headers: { authorization: `Bearer ${accessToken}`, 'user-agent': 'omninews/1.0' },
      });
      if (!res.ok) throw new Error(`reddit_api: ${res.status}`);
      const json = (await res.json()) as {
        data?: {
          children?: Array<{
            data?: {
              id?: string; title?: string; permalink?: string; created_utc?: number;
              score?: number; num_comments?: number; thumbnail?: string;
            };
          }>;
        };
      };
      return (json.data?.children ?? []).map(({ data: p }) => ({
        id: p?.id ?? '',
        title: p?.title ?? '',
        thumbnail_url: p?.thumbnail?.startsWith('http') ? p.thumbnail : '',
        published_at: p?.created_utc ? p.created_utc * 1000 : 0,
        duration_sec: null,
        view_count: null,
        like_count: p?.score ?? null,
        comment_count: p?.num_comments ?? null,
        url: p?.permalink ? `https://www.reddit.com${p.permalink}` : '',
      }));
    }
    case 'x': {
      const u = new URL(`https://api.twitter.com/2/users/${account.external_id}/tweets`);
      u.searchParams.set('max_results', String(Math.max(5, Math.min(limit, 100))));
      u.searchParams.set('tweet.fields', 'created_at,public_metrics');
      const res = await fetch(u, { headers: { authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`x_api: ${res.status}`);
      const json = (await res.json()) as {
        data?: Array<{
          id?: string; text?: string; created_at?: string;
          public_metrics?: { like_count?: number; reply_count?: number; impression_count?: number };
        }>;
      };
      return (json.data ?? []).map((t) => ({
        id: t.id ?? '',
        title: t.text ?? '',
        thumbnail_url: '',
        published_at: t.created_at ? Date.parse(t.created_at) : 0,
        duration_sec: null,
        view_count: t.public_metrics?.impression_count ?? null,
        like_count: t.public_metrics?.like_count ?? null,
        comment_count: t.public_metrics?.reply_count ?? null,
        url: t.id ? `https://x.com/i/status/${t.id}` : '',
      }));
    }
  }
}
