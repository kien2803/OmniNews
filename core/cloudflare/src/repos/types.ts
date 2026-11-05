/** Row types mirroring the D1 schema — D1 returns rows as objects. */
export type Platform = 'facebook' | 'threads' | 'reddit' | 'x';
export type Visibility = 'public' | 'unlisted' | 'private';
export type AccountStatus = 'active' | 'expired' | 'revoked';
export type ScheduledPostStatus = 'draft' | 'pending' | 'uploading' | 'published' | 'failed' | 'dead';

export interface AccountRow {
  id: string;
  user_id: string;
  platform: Platform;
  external_id: string;
  display_name: string;
  oauth_refresh_token: string;
  oauth_access_token: string | null;
  token_expires_at: number | null;
  status: AccountStatus;
  created_at: number;
  content_category: string;
  language_code: string;
  purpose: string;
  link: string;
  channel_handle: string;
  avatar_url: string;
  subscribers: number | null;
  views: number | null;
  video_count: number | null;
  like_count: number | null;
  avg_watch_seconds: number | null;
  drop_off_pct: number | null;
  last_sync_at: number | null;
}

/** A schedulable piece of written content — the library item that replaces
 *  videos. `images` is a JSON-encoded string array of public image URLs. */
export interface ArticleRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  link_url: string;
  /** JSON string — parse to string[] before use. */
  images: string;
  created_at: number;
  updated_at: number;
}

export interface ScheduledPostRow {
  id: string;
  user_id: string;
  article_id: string | null;
  account_id: string;
  scheduled_at: number;
  caption: string;
  per_platform_caption: string | null;
  visibility: Visibility;
  status: ScheduledPostStatus;
  external_post_id: string | null;
  last_error: string | null;
  retry_count: number;
  next_retry_at: number | null;
  notes: string | null;
  is_dead: number;
  created_at: number;
  updated_at: number;
}

/** Joined row used by the queue consumer — post + its account + article. */
export interface ClaimedPost extends ScheduledPostRow {
  account: AccountRow;
  article: ArticleRow;
}

/** A post synced from an account's published library (0008 renamed
 *  channel_videos → channel_posts). `external_id` is the platform's post id
 *  — unique per account. `duration_sec` stays for schema compat; always
 *  null for text platforms. */
export interface ChannelPostRow {
  id: string;
  account_id: string;
  user_id: string;
  platform: Platform;
  external_id: string;
  title: string;
  thumbnail_url: string;
  url: string;
  published_at: number | null;
  duration_sec: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  synced_at: number;
}
