import { classifyHttpError, reportError } from './telemetry.js';

/** Supported platforms — mirrors the worker's repos/types.ts. The SPA no
 *  longer pulls this from @social-auto/shared (that package still reflects
 *  the legacy video stack used by core/api + core/worker). */
export type Platform = 'facebook' | 'threads' | 'reddit' | 'x';

export const PLATFORMS: Platform[] = ['facebook', 'threads', 'reddit', 'x'];

export const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: 'Facebook',
  threads: 'Threads',
  reddit: 'Reddit',
  x: 'X',
};

/** Publish-time text caps — mirrors worker lib/platforms.ts. */
export const PLATFORM_TEXT_LIMITS: Record<Platform, number> = {
  facebook: 63206,
  threads: 500,
  reddit: 40000,
  x: 280,
};

export type ScheduledPostStatus = 'draft' | 'pending' | 'uploading' | 'published' | 'failed' | 'dead';
export type Visibility = 'public' | 'unlisted' | 'private';

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

/** Wire shape returned by /articles — `images` arrives already parsed. */
export interface ArticleWire {
  id: string;
  title: string;
  body: string;
  link_url: string;
  images: string[];
  created_at: number;
  updated_at: number;
}

export interface ArticleInput {
  title?: string;
  body?: string;
  link_url?: string;
  images?: string[];
}

// Account domain types
//
// These mirror the wire shape returned by the backend's /accounts routes.
// They deliberately exclude any OAuth credential fields (refresh token,
// access token, password, API key, etc.) — those never leave the server.
// `external_id` is the platform-issued opaque channel id and is safe to
// display; we never treat it as a secret.
// ──────────────────────────────────────────────────────────────────────────

export const ACCOUNT_CONTENT_CATEGORIES = ['TECH', 'MEME', 'GADGET', 'ROBLOX'] as const;
export type AccountContentCategory = (typeof ACCOUNT_CONTENT_CATEGORIES)[number];

export const ACCOUNT_LANGUAGE_CODES = ['ENGLISH', 'VIETNAMESE'] as const;
export type AccountLanguageCode = (typeof ACCOUNT_LANGUAGE_CODES)[number] | '';

export interface AccountMetadata {
  /** Free-form content bucket. Empty string when unset. */
  content_category: string;
  language_code: AccountLanguageCode;
  purpose: string;
  link: string;
  /** Per-account publish target — subreddit for reddit ('news' / 'r/news'). */
  target: string;
}

export interface AccountChannelSnapshot {
  /** Platform-issued handle, e.g. "@name" / "username". '' when unknown. */
  channel_handle: string;
  /** Default avatar URL. '' when unknown. */
  avatar_url: string;
  /** Follower/subscriber count, null if private / unknown. */
  subscribers: number | null;
  /** Total view count, null if private / unknown. */
  views: number | null;
  /** Public post count, null if unknown. */
  video_count: number | null;
  /** Like/reaction total when the platform exposes one. null if unknown. */
  like_count: number | null;
  avg_watch_seconds: number | null;
  drop_off_pct: number | null;
  /** Unix ms of the last successful sync. null = never synced. */
  snapshot_at: number | null;
}

/**
 * One row in the account's "Recent posts" list. Rows come from the synced
 * server-side library (POST .../posts/sync).
 */
export interface ChannelPost {
  id: string;
  title: string;
  thumbnail_url: string;
  published_at: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  url: string;
}

export interface ChannelPostListResponse {
  posts: ChannelPost[];
  /** ms epoch of the last sync — null when the library was never synced. */
  synced_at: number | null;
}

export interface ChannelPostSyncResponse {
  synced: number;
  synced_at: number;
}
export interface AccountRow {
  id: string;
  platform: Platform;
  /** Platform-issued opaque channel id — safe to display (truncated). */
  external_id: string;
  display_name: string;
  status: 'active' | 'expired' | 'revoked';
  created_at: number;
  metadata: AccountMetadata;
  channel: AccountChannelSnapshot;
  auto_reply_enabled?: number;
  auto_reply_template?: string | null;
}

export interface CommentRow {
  id: string;
  account_id: string;
  post_id: string | null;
  external_post_id: string;
  platform: Platform;
  author_name: string;
  text: string;
  commented_at: number;
  reply_text: string | null;
  reply_status: 'none' | 'auto' | 'manual' | 'failed';
  replied_at: number | null;
  account_display_name?: string;
}

export interface AccountListFilter {
  search?: string;
  platform?: Platform | '';
  content?: AccountContentCategory | '';
  language?: Exclude<AccountLanguageCode, ''> | '';
  status?: 'active' | 'expired' | 'revoked' | '';
  limit?: number;
  offset?: number;
}

export interface AccountListResponse {
  accounts: AccountRow[];
  total: number;
}

export interface UpdateAccountInput {
  display_name?: string;
  content_category?: AccountContentCategory | '';
  language_code?: AccountLanguageCode;
  purpose?: string | null;
  link?: string | null;
  target?: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Stats / analytics shapes
// ────────────────────────────────────────────────────────────────────────────

export interface AccountStats {
  account_id: string;
  by_status: Record<string, number>;
  total: number;
  last_published_at: number | null;
}

export interface AnalyticsRow {
  account_id: string;
  platform: string;
  display_name: string;
  by_status: Record<string, number>;
  total: number;
  last_published_at: number | null;
}

// ────────────────────────────────────────────────────────────────────────────
// HTTP layer
// ────────────────────────────────────────────────────────────────────────────

const BASE = '/api';

// Get JWT token from localStorage
function getToken(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return localStorage.getItem('auth_token');
}

// Set JWT token in localStorage
function setToken(token: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  localStorage.setItem('auth_token', token);
}

// Clear JWT token from localStorage
function clearToken(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  localStorage.removeItem('auth_token');
  if (typeof document !== 'undefined') {
    document.cookie = 'oauth_token=; path=/auth; max-age=0';
  }
}

// OAuth connect is a full-page navigation, so the API never sees the
// Authorization header. Copy the JWT into a short-lived cookie scoped to
// /auth so the optional-auth callback can attribute the connected account
// to the logged-in user instead of falling back to 'default-user'.
export function stageOAuthTokenCookie(): void {
  const token = getToken();
  if (!token || typeof document === 'undefined') return;
  const secure = window.location?.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `oauth_token=${encodeURIComponent(token)}; path=/auth; max-age=600; SameSite=Lax${secure}`;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const url = `${BASE}${path}`;
  let res: Response;
  try {
    const token = getToken();
    res = await fetch(url, {
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { 'authorization': `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch (err) {
    // Network failure — server down, CORS, offline. Surface to telemetry
    // before re-throwing so the page handlers + the React Query subscriber
    // see the same classified error.
    reportError('network', `${method} ${path}`, err, { url });
    throw err;
  }
  if (!res.ok) {
    // Handle 401 Unauthorized - token expired
    if (res.status === 401) {
      clearToken();
      window.location.href = '/login';
      throw new ApiError(401, 'Unauthorized - Please login again');
    }
    const body = await res.json().catch(() => ({}));
    const apiError = new ApiError(res.status, body.error ?? res.statusText);
    reportError(classifyHttpError(res.status), `${method} ${path}`, apiError, {
      url,
      status: res.status,
    });
    throw apiError;
  }
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch (err) {
    reportError('parse', `${method} ${path}`, err, { url, status: res.status });
    throw err;
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
// ────────────────────────────────────────────────────────────────────────────
// API surface
// ────────────────────────────────────────────────────────────────────────────

function accountFilterQs(f?: AccountListFilter): string {
  if (!f) return '';
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.platform) params.set('platform', f.platform);
  if (f.content) params.set('content', f.content);
  if (f.language) params.set('language', f.language);
  if (f.status) params.set('status', f.status);
  if (typeof f.limit === 'number') params.set('limit', String(f.limit));
  if (typeof f.offset === 'number') params.set('offset', String(f.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  listArticles: (q?: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const qs = params.toString();
    return req<{ articles: ArticleWire[] }>(`/articles${qs ? `?${qs}` : ''}`);
  },
  getArticle: (id: string) => req<{ article: ArticleWire }>(`/articles/${id}`),
  createArticle: (input: ArticleInput) =>
    req<{ article: ArticleWire }>('/articles', { method: 'POST', body: JSON.stringify(input) }),
  updateArticle: (id: string, input: ArticleInput) =>
    req<{ article: ArticleWire }>(`/articles/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteArticle: (id: string) => req<{ ok: true }>(`/articles/${id}`, { method: 'DELETE' }),

  listSchedule: (q?: { status?: string; account_id?: string; from?: number; to?: number; q?: string }) => {
    const params = new URLSearchParams();
    if (q?.status) params.set('status', q.status);
    if (q?.account_id) params.set('account_id', q.account_id);
    if (q?.from !== undefined) params.set('from', String(q.from));
    if (q?.to !== undefined) params.set('to', String(q.to));
    if (q?.q) params.set('q', q.q);
    const qs = params.toString();
    return req<{ posts: ScheduledPostRow[] }>(`/schedule${qs ? `?${qs}` : ''}`);
  },
  getSchedule: (id: string) => req<ScheduledPostRow>(`/schedule/${id}`),
  createSchedule: (body: CreateScheduleInput) =>
    req<{ posts: ScheduledPostRow[] }>('/schedule', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateSchedule: (id: string, patch: UpdateScheduleInput) =>
    req<ScheduledPostRow>(`/schedule/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteSchedule: (id: string) => req<{ ok: true }>(`/schedule/${id}`, { method: 'DELETE' }),
  retrySchedule: (id: string) => req<ScheduledPostRow>(`/schedule/${id}/retry`, { method: 'POST', body: '' }),
  dashboardCounts: () => req<DashboardCounts>('/dashboard/counts'),
  health: () => req<HealthResponse>('/health'),
  quota: () => req<QuotaResponse>('/quota'),
  listComments: (f?: { account_id?: string; reply_status?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (f?.account_id) p.set('account_id', f.account_id);
    if (f?.reply_status) p.set('reply_status', f.reply_status);
    if (f?.q) p.set('q', f.q);
    const qs = p.toString();
    return req<{ comments: CommentRow[] }>(`/comments${qs ? `?${qs}` : ''}`);
  },
  replyComment: (id: string, text: string) =>
    req<{ ok: true }>(`/comments/${id}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
  setAutoReply: (accountId: string, enabled: boolean, template: string) =>
    req<{ ok: true }>(`/comments/auto-reply/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled, template }),
    }),

  // Account list — server-side filtered, paged, and inclusive of
  // metadata + channel snapshot for the AccountsPage UI.
  listAccounts: (filter?: AccountListFilter) =>
    req<AccountListResponse>(`/accounts${accountFilterQs(filter)}`),
  updateAccount: (id: string, patch: UpdateAccountInput) =>
    req<AccountRow>(`/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteAccount: (id: string) =>
    req<{ ok: true }>(`/accounts/${id}`, { method: 'DELETE' }),
  accountStats: (id: string) => req<AccountStats>(`/accounts/${id}/stats`),
  listChannelPosts: (id: string) =>
    req<ChannelPostListResponse>(`/accounts/${id}/posts`),
  syncChannelPosts: (id: string) =>
    req<ChannelPostSyncResponse>(`/accounts/${id}/posts/sync`, { method: 'POST', body: '' }),

  analytics: (accountId?: string, range?: { from?: number; to?: number }) => {
    const p = new URLSearchParams();
    if (accountId) p.set('account_id', accountId);
    if (range?.from !== undefined) p.set('from', String(range.from));
    if (range?.to !== undefined) p.set('to', String(range.to));
    const q = p.toString();
    return req<{ rows: AnalyticsRow[] }>(`/analytics${q ? `?${q}` : ''}`);
  },
  listHistory: (q?: {
    platform?: string;
    status?: string;
    account_id?: string;
    date_from?: string;
  }) => {
    const params = new URLSearchParams();
    if (q?.platform) params.set('platform', q.platform);
    if (q?.status) params.set('status', q.status);
    if (q?.account_id) params.set('account_id', q.account_id);
    if (q?.date_from) params.set('date_from', q.date_from);
    const qs = params.toString();
    return req<{ posts: ScheduledPostRow[] }>(`/history${qs ? `?${qs}` : ''}`);
  },
};

export interface CreateScheduleInput {
  article_id: string;
  caption?: string;
  per_platform_caption?: Record<string, string>;
  scheduled_at: number;
  visibility?: Visibility;
  draft?: boolean;
  notes?: string;
  account_ids: string[];
}

export interface UpdateScheduleInput {
  caption?: string;
  scheduled_at?: number;
  visibility?: Visibility;
  notes?: string | null;
  /** Promote a draft to pending — requires scheduled_at. */
  schedule?: boolean;
}

export interface DashboardCounts {
  by_status: Record<string, number>;
  published_last_7d: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: number;
  runtime?: string;
  last_cron_at?: number | null;
  worker_lag_sec?: number | null;
}

export interface QuotaResponse {
  quotas: Array<{
    platform: Platform;
    used: number;
    limit: number;
    remaining: number;
    reset_at: number;
    warning: boolean;
  }>;
  now: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Authentication API
// ────────────────────────────────────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: number;
}

export const authApi = {
  register: (input: RegisterInput) =>
    req<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  login: (input: LoginInput) =>
    req<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getCurrentUser: () => req<User>('/auth/me'),
  updateProfile: (name: string) =>
    req<User>('/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) }),
  changePassword: async (current_password: string, new_password: string) => {
    // The server revokes all tokens on password change and returns a fresh
    // one — store it or the user is silently logged out.
    const r = await req<{ success: boolean; token?: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    });
    if (r.token) setToken(r.token);
    return r;
  },
  deleteAccount: () => req<{ success: boolean }>('/auth/me', { method: 'DELETE' }),
};

// Export token utilities for use in AuthContext
export { getToken, setToken, clearToken };
