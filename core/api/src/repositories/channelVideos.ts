import { randomUUID } from 'node:crypto';
import type { DB } from '../db.js';
import type { ChannelVideoItem } from '../lib/channelVideos.js';
import type { ChannelVideoRow, Platform } from '@social-auto/shared';

const LIST_LIMIT = 50;

function rowToChannelVideo(row: unknown[]): ChannelVideoRow {
  return {
    id: row[0] as string,
    account_id: row[1] as string,
    user_id: row[2] as string,
    platform: row[3] as Platform,
    external_id: row[4] as string,
    title: row[5] as string,
    thumbnail_url: row[6] as string,
    url: row[7] as string,
    published_at: (row[8] as number | null) ?? null,
    duration_sec: (row[9] as number | null) ?? null,
    view_count: (row[10] as number | null) ?? null,
    like_count: (row[11] as number | null) ?? null,
    comment_count: (row[12] as number | null) ?? null,
    synced_at: row[13] as number,
  };
}

/**
 * Persisted per-account video library — rows written by manual sync
 * (POST /accounts/:id/videos/sync) and read by GET /accounts/:id/videos.
 */
export class ChannelVideosRepo {
  constructor(private db: DB) {}

  /** Upsert the freshly fetched list, then prune rows the platform no
   *  longer returns (deleted/privated videos disappear from the library). */
  replaceForAccount(
    account: { id: string; user_id: string; platform: Platform },
    items: ChannelVideoItem[],
    syncedAt: number,
  ): void {
    for (const v of items) {
      this.db.raw.run(
        `INSERT INTO channel_videos
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
        [
          randomUUID(),
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
        ],
      );
    }
    // Anything still carrying an older synced_at wasn't in this batch —
    // the platform dropped it, so drop our copy.
    this.db.raw.run(
      'DELETE FROM channel_videos WHERE account_id = ? AND synced_at < ?',
      [account.id, syncedAt],
    );
  }

  listByAccount(accountId: string): ChannelVideoRow[] {
    const res = this.db.raw.exec(
      `SELECT id, account_id, user_id, platform, external_id, title, thumbnail_url, url,
              published_at, duration_sec, view_count, like_count, comment_count, synced_at
       FROM channel_videos WHERE account_id = ?
       ORDER BY published_at DESC LIMIT ?`,
      [accountId, LIST_LIMIT],
    );
    return (res[0]?.values ?? []).map(rowToChannelVideo);
  }

  lastSyncAt(accountId: string): number | null {
    const res = this.db.raw.exec(
      'SELECT MAX(synced_at) FROM channel_videos WHERE account_id = ?',
      [accountId],
    );
    return (res[0]?.values[0]?.[0] as number | null) ?? null;
  }
}
