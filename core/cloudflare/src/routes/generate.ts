import { Hono } from 'hono';
import { ArticlesRepo } from '../repos/articles';
import { AccountsRepo } from '../repos/accounts';
import { bearerUserId } from '../lib/auth';
import { rateLimit } from '../lib/rateLimit';
import { generateVariant } from '../lib/ai';
import { isHttpUrl, validatePost } from '../lib/variants';
import type { Platform } from '../repos/types';
import type { Env } from '../env';

export const generateRoutes = new Hono<{ Bindings: Env }>();

const PLATFORMS: ReadonlySet<string> = new Set(['facebook', 'threads', 'reddit', 'x']);
const TONES: ReadonlySet<string> = new Set(['neutral', 'professional', 'casual']);
const LANGS: ReadonlySet<string> = new Set(['keep', 'english', 'vietnamese']);
const TITLE_MAX = 300;
const BODY_MAX = 20_000;
const LINK_MAX = 2000;
const IMAGES_MAX = 10;

interface GenerateBody {
  /** Saved article — server fetches + ownership-checks. */
  article_id?: string;
  /** Inline draft story — for the not-yet-saved composer article. */
  article?: { title?: string; body?: string; link_url?: string; images?: string[] };
  /** One account id (variant generation is per-account). */
  account_id: string;
  tone?: string;
  language?: string;
}

generateRoutes.post('/generate', async (c) => {
  const userId = await bearerUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const limited = await rateLimit(c, `generate:${userId}`, 20, 60);
  if (limited) return limited;

  const body = (await c.req.json().catch(() => null)) as GenerateBody | null;
  if (!body) return c.json({ error: 'invalid_body' }, 400);
  if (body.tone !== undefined && !TONES.has(body.tone)) return c.json({ error: 'invalid_tone' }, 400);
  if (body.language !== undefined && !LANGS.has(body.language)) return c.json({ error: 'invalid_language' }, 400);
  if (!body.account_id) return c.json({ error: 'account_id required' }, 400);

  const account = await new AccountsRepo(c.env.DB).findById(body.account_id);
  if (!account) return c.json({ error: 'account_not_found' }, 404);
  if (account.user_id !== userId) return c.json({ error: 'account_not_owned' }, 403);
  if (account.status !== 'active') return c.json({ error: 'account_not_active' }, 400);
  if (!PLATFORMS.has(account.platform)) return c.json({ error: 'unsupported_platform' }, 400);

  // Story source: saved article (ownership-checked) or inline draft.
  let article: { title: string; body: string; link_url: string; images: string[] };
  if (body.article_id) {
    const row = await new ArticlesRepo(c.env.DB).findById(body.article_id);
    if (!row) return c.json({ error: 'article_not_found' }, 404);
    if (row.user_id !== userId) return c.json({ error: 'article_not_owned' }, 403);
    article = {
      title: row.title ?? '', body: row.body ?? '', link_url: row.link_url ?? '',
      images: JSON.parse(row.images || '[]') as string[],
    };
  } else if (body.article && typeof body.article === 'object') {
    const a = body.article;
    if ((a.title ?? '').length > TITLE_MAX) return c.json({ error: `title max ${TITLE_MAX}` }, 400);
    if ((a.body ?? '').length > BODY_MAX) return c.json({ error: `body max ${BODY_MAX}` }, 400);
    if ((a.link_url ?? '').length > LINK_MAX) return c.json({ error: `link max ${LINK_MAX}` }, 400);
    const images = Array.isArray(a.images) ? a.images.filter((u): u is string => typeof u === 'string').slice(0, IMAGES_MAX) : [];
    if (images.some((u) => u.length > LINK_MAX || !isHttpUrl(u))) return c.json({ error: 'invalid_image_url' }, 400);
    if (a.link_url && !isHttpUrl(a.link_url)) return c.json({ error: 'invalid_link_url' }, 400);
    if (!(a.title?.trim() || a.body?.trim() || a.link_url?.trim() || images.length)) {
      return c.json({ error: 'article_empty' }, 400);
    }
    article = { title: a.title ?? '', body: a.body ?? '', link_url: a.link_url ?? '', images };
  } else {
    return c.json({ error: 'article_id or article required' }, 400);
  }

  const platform = account.platform as Platform;
  const result = await generateVariant(c.env, {
    platform,
    article,
    target: account.target || undefined,
    tone: body.tone as GenerateBody['tone'] & 'neutral',
    language: body.language as GenerateBody['language'] & 'keep',
  });
  const validation = validatePost(
    platform,
    { ...article, images: JSON.stringify(article.images) },
    result.variant,
    null,
  );
  return c.json({ ...result, validation });
});
