import { Hono } from 'hono';
import type { Env } from '../env';
import { bearerUserId } from '../lib/auth';
import { CommentsRepo } from '../repos/comments';
import { AccountsRepo } from '../repos/accounts';
import { decrypt, encrypt } from '../lib/crypto';
import { replyComment } from '../lib/commentClients';

export const commentsRoutes = new Hono<{ Bindings: Env }>();

commentsRoutes.get('/comments', async (c) => {
  const userId = await bearerUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const q = c.req.query();
  const rows = await new CommentsRepo(c.env.DB).list(userId, {
    account_id: q.account_id,
    reply_status: q.reply_status,
    q: q.q,
  });
  return c.json({ comments: rows });
});

/** Manual reply to a single comment. */
commentsRoutes.post('/comments/:id/reply', async (c) => {
  const userId = await bearerUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const body = (await c.req.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.trim();
  if (!text) return c.json({ error: 'text required' }, 400);
  if (text.length > 2000) return c.json({ error: 'text_too_long' }, 400);

  const repo = new CommentsRepo(c.env.DB);
  const row = await repo.findOwned(c.req.param('id'), userId);
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.reply_status === 'auto' || row.reply_status === 'manual') {
    return c.json({ error: 'already_replied' }, 409);
  }

  const account = await new AccountsRepo(c.env.DB).findById(row.account_id);
  if (!account?.oauth_access_token) return c.json({ error: 'account_unavailable' }, 409);
  const token = await decrypt(account.oauth_access_token, c.env.TOKEN_ENCRYPTION_KEY);
  const ok = await replyComment(row.platform, row.external_comment_id, text, token);
  await repo.markReplied(row.id, ok ? 'manual' : 'failed', text);
  return ok ? c.json({ ok: true }) : c.json({ error: 'reply_failed' }, 502);
});

/** Per-account auto-reply settings. */
commentsRoutes.patch('/comments/auto-reply/:accountId', async (c) => {
  const userId = await bearerUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const body = (await c.req.json().catch(() => null)) as {
    enabled?: boolean;
    template?: string;
  } | null;
  const account = await new AccountsRepo(c.env.DB).findById(c.req.param('accountId'));
  if (!account || account.user_id !== userId) return c.json({ error: 'not_found' }, 404);
  const template = body?.template?.slice(0, 500) ?? null;
  await c.env.DB.prepare(
    'UPDATE accounts SET auto_reply_enabled = ?, auto_reply_template = ? WHERE id = ?',
  )
    .bind(body?.enabled ? 1 : 0, template, account.id)
    .run();
  return c.json({ ok: true, enabled: !!body?.enabled, template });
});
