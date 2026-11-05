import type { Env } from '../env';

/** Minimal Meta Graph API client — fetch-based, Workers-safe.
 *  Page access tokens stored on the account row authenticate the Facebook
 *  Page edges (feed posts, photos, comments). */

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

async function graphPost<T>(env: Env, path: string, accessToken: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}/${apiVersion(env)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: accessToken, ...params }),
  });
  const json = (await res.json()) as T & GraphError;
  if (!res.ok || json.error) {
    throw new Error(`meta_api: ${json.error?.code ?? res.status} ${json.error?.message ?? res.statusText}`.trim());
  }
  return json;
}

export interface FacebookPost {
  id?: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
}

/** Posts published on a Facebook Page — `/{page-id}/published_posts`.
 *  Reaction/comment totals ride along as summaries (one request). */
export async function listFacebookPosts(pageId: string, accessToken: string, env: Env, limit = 25): Promise<FacebookPost[]> {
  const json = await graphGet<{ data?: FacebookPost[] }>(
    env,
    `/${pageId}/published_posts`,
    accessToken,
    {
      fields: 'id,message,created_time,permalink_url,full_picture,reactions.summary(true).limit(0),comments.summary(true).limit(0)',
      limit: String(limit),
    },
  );
  return json.data ?? [];
}

/** Publish a text/link post to a Facebook Page feed. Returns the post id. */
export async function publishFacebookPost(
  env: Env,
  pageId: string,
  accessToken: string,
  input: { message: string; link?: string; images?: string[] },
): Promise<{ id: string }> {
  const images = (input.images ?? []).filter(Boolean);
  if (images.length) {
    // Attach images as unpublished photos, then reference them from the
    // feed post — the only way Graph accepts multi-photo posts.
    const attached: string[] = [];
    for (const url of images.slice(0, 10)) {
      const photo = await graphPost<{ id?: string }>(
        env,
        `/${pageId}/photos`,
        accessToken,
        { url, published: 'false' },
      );
      if (photo.id) attached.push(photo.id);
    }
    const params: Record<string, string> = { message: input.message };
    attached.forEach((id, i) => {
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
    });
    if (input.link) params.link = input.link;
    return graphPost<{ id: string }>(env, `/${pageId}/feed`, accessToken, params);
  }
  const params: Record<string, string> = { message: input.message };
  if (input.link) params.link = input.link;
  return graphPost<{ id: string }>(env, `/${pageId}/feed`, accessToken, params);
}
