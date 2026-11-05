import type { Env } from '../env';
import { decrypt } from './crypto';
import { fetchComments, replyComment } from './commentClients';
import { CommentsRepo } from '../repos/comments';

const POLL_POST_LIMIT = 20;
const AUTO_REPLY_LIMIT_PER_RUN = 5;
const DEFAULT_TEMPLATE = 'Thanks {author}!';

interface PolledPost {
  post_id: string;
  user_id: string;
  account_id: string;
  external_post_id: string;
  platform: string;
  auto_reply_enabled: number;
  auto_reply_template: string | null;
  oauth_access_token: string | null;
}

/**
 * Cron step: pull comments on recently published posts, dedupe-store new
 * ones, and send template auto-replies where the account opted in.
 * Bounded work per run — the queue-backed minute cron must stay cheap.
 */
export async function pollComments(env: Env): Promise<void> {
  const { results: posts } = await env.DB.prepare(
    `SELECT p.id AS post_id, p.user_id, a.id AS account_id, a.platform,
            p.external_post_id, a.auto_reply_enabled, a.auto_reply_template,
            a.oauth_access_token
     FROM scheduled_posts p JOIN accounts a ON a.id = p.account_id
     WHERE p.status = 'published' AND p.external_post_id IS NOT NULL AND p.external_post_id != ''
       AND a.platform IN ('facebook', 'threads') AND a.status = 'active'
     ORDER BY p.updated_at DESC LIMIT ?`,
  )
    .bind(POLL_POST_LIMIT)
    .all<PolledPost>();

  const repo = new CommentsRepo(env.DB);
  let autoReplies = 0;
  for (const post of posts ?? []) {
    if (!post.oauth_access_token) continue;
    let token: string;
    try {
      token = await decrypt(post.oauth_access_token, env.TOKEN_ENCRYPTION_KEY);
    } catch {
      continue;
    }
    const remote = await fetchComments(post.platform, post.external_post_id, token);
    for (const rc of remote) {
      const inserted = await repo.insertIgnore({
        user_id: post.user_id,
        account_id: post.account_id,
        post_id: post.post_id,
        external_post_id: post.external_post_id,
        external_comment_id: rc.external_comment_id,
        platform: post.platform,
        author_name: rc.author_name,
        author_id: rc.author_id,
        text: rc.text,
        commented_at: rc.commented_at,
      });
      if (!inserted || !post.auto_reply_enabled || autoReplies >= AUTO_REPLY_LIMIT_PER_RUN) continue;
      const template = post.auto_reply_template || DEFAULT_TEMPLATE;
      const text = template.replaceAll('{author}', rc.author_name || 'there');
      const ok = await replyComment(post.platform, rc.external_comment_id, text, token);
      const row = await repo.findByExternal(post.platform, rc.external_comment_id);
      if (row) await repo.markReplied(row.id, ok ? 'auto' : 'failed', text);
      if (ok) autoReplies++;
    }
  }
}
