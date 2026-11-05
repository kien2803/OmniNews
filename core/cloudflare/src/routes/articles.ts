import { Hono } from 'hono';
import type { Context } from 'hono';
import { ArticlesRepo } from '../repos/articles';
import { bearerUserId } from '../lib/auth';
import type { ArticleRow } from '../repos/types';
import type { Env } from '../env';

const TITLE_MAX = 300;
const BODY_MAX = 20_000;
const LINK_MAX = 2000;
const IMAGES_MAX = 10;
const IMAGE_URL_MAX = 2000;

function toWire(row: ArticleRow) {
  let images: string[] = [];
  try {
    const arr = JSON.parse(row.images || '[]') as unknown;
    if (Array.isArray(arr)) images = arr.filter((u): u is string => typeof u === 'string');
  } catch {
    /* corrupt JSON → empty */
  }
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    link_url: row.link_url,
    images,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

interface ArticleBody {
  title?: string;
  body?: string;
  link_url?: string;
  images?: unknown;
}

/** Shared validation — returns a normalized payload or an error string. */
function validateArticleInput(body: ArticleBody): { title: string; body: string; link_url: string; images: string[] } | { error: string } {
  const title = (body.title ?? '').trim();
  const text = (body.body ?? '').trim();
  const link = (body.link_url ?? '').trim();
  if (title.length > TITLE_MAX) return { error: `title_too_long: max ${TITLE_MAX} chars` };
  if (text.length > BODY_MAX) return { error: `body_too_long: max ${BODY_MAX} chars` };
  if (link.length > LINK_MAX) return { error: 'link_too_long' };
  if (link && !isHttpUrl(link)) return { error: 'invalid_link_url' };
  let images: string[] = [];
  if (body.images !== undefined) {
    if (!Array.isArray(body.images)) return { error: 'invalid_images' };
    images = body.images.filter((u): u is string => typeof u === 'string').map((u) => u.trim()).filter(Boolean);
    if (images.length > IMAGES_MAX) return { error: `too_many_images: max ${IMAGES_MAX}` };
    if (images.some((u) => u.length > IMAGE_URL_MAX || !isHttpUrl(u))) return { error: 'invalid_image_url' };
  }
  if (!title && !text && !link && !images.length) return { error: 'article_empty: title, body, link or images required' };
  return { title, body: text, link_url: link, images };
}

export const articleRoutes = new Hono<{ Bindings: Env }>();

articleRoutes.get('/articles', async (c) => {
  const userId = await bearerUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const q = c.req.query();
  const rows = await new ArticlesRepo(c.env.DB).list(userId, {
    q: q.q?.trim() || undefined,
    limit: Math.min(Math.max(Number(q.limit) || 200, 1), 500),
    offset: Math.max(Number(q.offset) || 0, 0),
  });
  return c.json({ articles: rows.map(toWire) });
});

articleRoutes.post('/articles', async (c) => {
  const userId = await bearerUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const body = (await c.req.json().catch(() => null)) as ArticleBody | null;
  if (!body) return c.json({ error: 'invalid_body' }, 400);
  const input = validateArticleInput(body);
  if ('error' in input) return c.json({ error: input.error }, 400);
  const row = await new ArticlesRepo(c.env.DB).insert({ user_id: userId, ...input });
  return c.json({ article: toWire(row) }, 201);
});

async function ownedArticle(c: Context<{ Bindings: Env }>, id: string) {
  const userId = await bearerUserId(c);
  if (!userId) return { error: c.json({ error: 'Unauthorized' }, 401) } as const;
  const row = await new ArticlesRepo(c.env.DB).findById(id);
  if (!row) return { error: c.json({ error: 'not_found' }, 404) } as const;
  if (row.user_id !== userId) return { error: c.json({ error: 'access_denied' }, 403) } as const;
  return { row, articles: new ArticlesRepo(c.env.DB), userId } as const;
}

articleRoutes.get('/articles/:id', async (c) => {
  const r = await ownedArticle(c, c.req.param('id'));
  if ('error' in r) return r.error;
  return c.json({ article: toWire(r.row) });
});

articleRoutes.patch('/articles/:id', async (c) => {
  const r = await ownedArticle(c, c.req.param('id'));
  if ('error' in r) return r.error;
  const body = (await c.req.json().catch(() => null)) as ArticleBody | null;
  if (!body) return c.json({ error: 'invalid_body' }, 400);
  const merged = {
    title: body.title ?? r.row.title,
    body: body.body ?? r.row.body,
    link_url: body.link_url ?? r.row.link_url,
    images: body.images !== undefined ? body.images : (JSON.parse(r.row.images || '[]') as string[]),
  };
  const input = validateArticleInput(merged);
  if ('error' in input) return c.json({ error: input.error }, 400);
  await r.articles.update(r.row.id, input);
  return c.json({ article: toWire((await r.articles.findById(r.row.id))!) });
});

articleRoutes.delete('/articles/:id', async (c) => {
  const r = await ownedArticle(c, c.req.param('id'));
  if ('error' in r) return r.error;
  // Draft/pending/uploading posts need the article at publish time —
  // refuse while any reference it. Terminal posts lose their content ref
  // via ON DELETE SET NULL, which is fine (they already ran).
  const live = await r.articles.countLivePosts(r.row.id);
  if (live > 0) return c.json({ error: `article_in_use: ${live} scheduled post(s) reference it` }, 409);
  await r.articles.delete(r.row.id);
  return c.json({ ok: true });
});
