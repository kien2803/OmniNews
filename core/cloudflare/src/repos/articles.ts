import type { ArticleRow } from './types';

export interface NewArticle {
  user_id: string;
  title?: string;
  body?: string;
  link_url?: string;
  /** Already-validated URL list — stored as JSON. */
  images?: string[];
}

export class ArticlesRepo {
  constructor(private db: D1Database) {}

  async insert(input: NewArticle): Promise<ArticleRow> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO articles (id, user_id, title, body, link_url, images, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.user_id,
        input.title ?? '',
        input.body ?? '',
        input.link_url ?? '',
        JSON.stringify(input.images ?? []),
        now,
        now,
      )
      .run();
    return (await this.findById(id))!;
  }

  async findById(id: string): Promise<ArticleRow | null> {
    return this.db.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<ArticleRow>();
  }

  async list(userId: string, opts?: { q?: string; limit?: number; offset?: number }): Promise<ArticleRow[]> {
    const where = ['user_id = ?'];
    const params: unknown[] = [userId];
    if (opts?.q) {
      where.push('(title LIKE ? OR body LIKE ?)');
      params.push(`%${opts.q.slice(0, 100)}%`, `%${opts.q.slice(0, 100)}%`);
    }
    return (
      await this.db
        .prepare(`SELECT * FROM articles WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(...params, opts?.limit ?? 200, opts?.offset ?? 0)
        .all<ArticleRow>()
    ).results;
  }

  async update(
    id: string,
    patch: { title?: string; body?: string; link_url?: string; images?: string[] },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.title !== undefined) { sets.push('title = ?'); params.push(patch.title); }
    if (patch.body !== undefined) { sets.push('body = ?'); params.push(patch.body); }
    if (patch.link_url !== undefined) { sets.push('link_url = ?'); params.push(patch.link_url); }
    if (patch.images !== undefined) { sets.push('images = ?'); params.push(JSON.stringify(patch.images)); }
    if (!sets.length) return;
    sets.push('updated_at = ?');
    params.push(Date.now(), id);
    await this.db.prepare(`UPDATE articles SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM articles WHERE id = ?').bind(id).run();
  }

  /** Scheduled posts still waiting on this article — deleting it would
   *  leave them un-publisheable, so the route refuses while any exist. */
  async countLivePosts(articleId: string): Promise<number> {
    const r = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE article_id = ? AND status IN ('draft', 'pending', 'uploading')`)
      .bind(articleId)
      .first<{ n: number }>();
    return r?.n ?? 0;
  }
}
