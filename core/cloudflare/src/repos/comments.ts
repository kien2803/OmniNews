export interface CommentRow {
  id: string;
  user_id: string;
  account_id: string;
  post_id: string | null;
  external_post_id: string;
  external_comment_id: string;
  platform: string;
  author_name: string;
  author_id: string;
  text: string;
  commented_at: number;
  reply_text: string | null;
  reply_status: 'none' | 'auto' | 'manual' | 'failed';
  replied_at: number | null;
  created_at: number;
  account_display_name?: string;
}

export interface NewComment {
  user_id: string;
  account_id: string;
  post_id: string | null;
  external_post_id: string;
  external_comment_id: string;
  platform: string;
  author_name: string;
  author_id: string;
  text: string;
  commented_at: number;
}

export class CommentsRepo {
  constructor(private db: D1Database) {}

  async insertIgnore(c: NewComment): Promise<boolean> {
    const res = await this.db
      .prepare(
        `INSERT OR IGNORE INTO comments
         (id, user_id, account_id, post_id, external_post_id, external_comment_id,
          platform, author_name, author_id, text, commented_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        c.user_id,
        c.account_id,
        c.post_id,
        c.external_post_id,
        c.external_comment_id,
        c.platform,
        c.author_name,
        c.author_id,
        c.text,
        c.commented_at,
        Date.now(),
      )
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async list(
    userId: string,
    f: { account_id?: string; reply_status?: string; q?: string; limit?: number },
  ): Promise<CommentRow[]> {
    const parts = ['c.user_id = ?'];
    const binds: unknown[] = [userId];
    if (f.account_id) {
      parts.push('c.account_id = ?');
      binds.push(f.account_id);
    }
    if (f.reply_status) {
      parts.push('c.reply_status = ?');
      binds.push(f.reply_status);
    }
    if (f.q) {
      parts.push('(c.text LIKE ? OR c.author_name LIKE ?)');
      binds.push(`%${f.q}%`, `%${f.q}%`);
    }
    binds.push(f.limit ?? 100);
    const { results } = await this.db
      .prepare(
        `SELECT c.*, a.display_name AS account_display_name
         FROM comments c JOIN accounts a ON a.id = c.account_id
         WHERE ${parts.join(' AND ')}
         ORDER BY c.commented_at DESC LIMIT ?`,
      )
      .bind(...binds)
      .all<CommentRow>();
    return results ?? [];
  }

  async findByExternal(platform: string, externalCommentId: string): Promise<CommentRow | null> {
    return this.db
      .prepare('SELECT * FROM comments WHERE platform = ? AND external_comment_id = ?')
      .bind(platform, externalCommentId)
      .first<CommentRow>();
  }

  async findOwned(id: string, userId: string): Promise<CommentRow | null> {
    return this.db
      .prepare('SELECT * FROM comments WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .first<CommentRow>();
  }

  async markReplied(id: string, status: 'auto' | 'manual' | 'failed', text: string): Promise<void> {
    await this.db
      .prepare('UPDATE comments SET reply_status = ?, reply_text = ?, replied_at = ? WHERE id = ?')
      .bind(status, text, Date.now(), id)
      .run();
  }
}
