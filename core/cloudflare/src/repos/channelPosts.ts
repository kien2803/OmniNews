import type { ChannelPostItem } from '../lib/channelPosts';
import type { ChannelPostRow, Platform } from './types';

const LIST_LIMIT = 50;

/**
 * Persisted per-account post library — rows written by manual sync
 * (POST /accounts/:id/posts/sync) and read by GET /accounts/:id/posts.
 */
export class ChannelPostsRepo {
  constructor(private db: D1Database) {}

  /** Upsert the freshly fetched list, then prune rows the platform no
   *  longer returns (deleted/removed posts disappear from the library). */
  async replaceForAccount(
    account: { id: string; user_id: string; platform: Platform },
    items: ChannelPostItem[],
    syncedAt: number,
  ): Promise<void> {
    const stmts = items.map((v) =>
      this.db
        .prepare(
          `INSERT INTO channel_posts
           (id, account_id, user_id, platform, external_id, title, thumbnail_url, url,
            published_at, duration_sec, view_count, like_count, comment_count, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (account_id, external_id) DO UPDATE SET
             title = excluded.title,
             thumbnail_url = excluded.thumbnail_url,
             url = excluded.url,
             published_at = excluded.published_at,
             duration_sec = excluded.duration_sec,
             view_count = excluded.view_count,
             like_count = excluded.like_count,
             comment_count = excluded.comment_count,
             synced_at = excluded.synced_at`,
        )
        .bind(
          crypto.randomUUID(),
          account.id,
          account.user_id,
          account.platform,
          v.id,
          v.title,
          v.thumbnail_url,
          v.url,
          v.published_at || null,
          v.duration_sec,
          v.view_count,
          v.like_count,
          v.comment_count,
          syncedAt,
        ),
    );
    // Anything still carrying an older synced_at wasn't in this batch —
    // the platform dropped it, so drop our copy.
    stmts.push(
      this.db
        .prepare('DELETE FROM channel_posts WHERE account_id = ? AND synced_at < ?')
        .bind(account.id, syncedAt),
    );
    await this.db.batch(stmts);
  }

  async listByAccount(accountId: string): Promise<ChannelPostRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM channel_posts WHERE account_id = ?
         ORDER BY published_at DESC LIMIT ?`,
      )
      .bind(accountId, LIST_LIMIT)
      .all<ChannelPostRow>();
    return results ?? [];
  }

  async lastSyncAt(accountId: string): Promise<number | null> {
    const row = await this.db
      .prepare('SELECT MAX(synced_at) AS t FROM channel_posts WHERE account_id = ?')
      .bind(accountId)
      .first<{ t: number | null }>();
    return row?.t ?? null;
  }
}
