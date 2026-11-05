import type { Env } from '../env';
import type { ClaimedPost, Platform } from '../repos/types';
import { publishFacebookPost } from './meta';
import { fitText, fitTitle } from './platforms';

export interface PublishResult {
  external_id: string;
  url?: string;
}

/** Full post text: an explicit per-account caption wins; otherwise the
 *  article's title + body (and its link where the platform can't attach
 *  one natively). */
function postText(post: ClaimedPost): string {
  if (post.caption?.trim()) return post.caption.trim();
  const parts = [post.article.title, post.article.body].filter((s) => s?.trim());
  return parts.join('\n\n').trim();
}

function postImages(post: ClaimedPost): string[] {
  try {
    const arr = JSON.parse(post.article.images || '[]') as unknown;
    return Array.isArray(arr) ? arr.filter((u): u is string => typeof u === 'string' && u.startsWith('http')) : [];
  } catch {
    return [];
  }
}

// ── Threads ────────────────────────────────────────────────────────────

async function publishThreads(post: ClaimedPost, token: string): Promise<PublishResult> {
  const images = postImages(post);
  let text = postText(post);
  if (post.article.link_url) text = `${text}\n${post.article.link_url}`.trim();
  text = fitText('threads', text);
  if (!text) throw new Error('invalid_text: empty threads post');

  const params: Record<string, string> = { access_token: token, text };
  if (images.length) {
    params.media_type = 'IMAGE';
    params.image_url = images[0];
  } else {
    params.media_type = 'TEXT';
  }
  const create = await fetch(`https://graph.threads.net/v1.0/${post.account.external_id}/threads`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const container = (await create.json()) as { id?: string; error?: { message?: string } };
  if (!create.ok || !container.id) {
    throw new Error(`threads_api: ${container.error?.message ?? create.status}`);
  }
  const pub = await fetch(`https://graph.threads.net/v1.0/${post.account.external_id}/threads_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: container.id, access_token: token }),
  });
  const out = (await pub.json()) as { id?: string; error?: { message?: string } };
  if (!pub.ok || !out.id) throw new Error(`threads_api: ${out.error?.message ?? pub.status}`);
  return { external_id: out.id };
}

// ── Reddit ─────────────────────────────────────────────────────────────

function redditTarget(post: ClaimedPost): string {
  const t = post.account.target?.trim();
  if (t) return t.startsWith('r/') || t.startsWith('u/') ? t : `r/${t}`;
  const name = post.account.channel_handle || post.account.external_id;
  return `u_${name}`;
}

async function publishReddit(post: ClaimedPost, token: string): Promise<PublishResult> {
  const text = fitText('reddit', postText(post));
  // Title comes from the article (or the first line of the text); Reddit
  // requires one and caps it at 300 chars.
  const title = fitTitle('reddit', post.article.title || text.split('\n')[0] || 'Post');
  const form = new URLSearchParams({
    api_type: 'json',
    sr: redditTarget(post),
    title,
    kind: post.article.link_url ? 'link' : 'self',
  });
  if (post.article.link_url) {
    form.set('url', post.article.link_url);
  } else {
    form.set('text', text);
  }
  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'omninews/1.0',
    },
    body: form,
  });
  const json = (await res.json()) as {
    json?: { errors?: Array<[string, string]>; data?: { id?: string; name?: string; url?: string } };
  };
  const errors = json.json?.errors ?? [];
  if (!res.ok || errors.length || !json.json?.data?.name) {
    throw new Error(`reddit_api: ${errors[0]?.[1] ?? res.status}`);
  }
  return { external_id: json.json.data.name, url: json.json.data.url };
}

// ── X (Twitter) ────────────────────────────────────────────────────────

async function publishX(post: ClaimedPost, token: string): Promise<PublishResult> {
  let text = postText(post);
  if (post.article.link_url && !text.includes(post.article.link_url)) {
    text = `${text}\n${post.article.link_url}`.trim();
  }
  text = fitText('x', text);
  if (!text) throw new Error('invalid_text: empty tweet');
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const json = (await res.json()) as { data?: { id?: string }; detail?: string; title?: string };
  if (!res.ok || !json.data?.id) {
    throw new Error(`x_api: ${json.detail ?? json.title ?? res.status}`);
  }
  return { external_id: json.data.id, url: `https://x.com/i/status/${json.data.id}` };
}

// ── Dispatch ───────────────────────────────────────────────────────────

const MOCKABLE: Platform[] = ['facebook', 'threads', 'reddit', 'x'];

/** Publish one claimed post to its account's platform. Throws on failure;
 *  the consumer classifies the error (retryable vs permanent).
 *  MOCK_PUBLISHERS=true short-circuits the platform call — for dev/E2E
 *  before real OAuth credentials exist. */
export async function publishPost(env: Env, post: ClaimedPost, accessToken: string): Promise<PublishResult> {
  if (env.MOCK_PUBLISHERS === 'true' && MOCKABLE.includes(post.account.platform)) {
    return { external_id: `mock_${post.account.platform}_${post.id}`, url: undefined };
  }
  switch (post.account.platform) {
    case 'facebook': {
      const r = await publishFacebookPost(env, post.account.external_id, accessToken, {
        message: fitText('facebook', postText(post)),
        link: post.article.link_url || undefined,
        images: postImages(post),
      });
      return { external_id: r.id };
    }
    case 'threads':
      return publishThreads(post, accessToken);
    case 'reddit':
      return publishReddit(post, accessToken);
    case 'x':
      return publishX(post, accessToken);
  }
}
