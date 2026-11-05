/** Cloudflare bindings + vars for the Worker. */
export interface Env {
  // Bindings
  DB: D1Database;
  STORAGE: R2Bucket;
  PUBLISH_QUEUE: Queue<PublishJob>;
  ASSETS: Fetcher;

  // Vars (wrangler.toml [vars])
  WEB_ORIGIN: string;
  STORAGE_QUOTA_GB: string;
  META_API_VERSION: string;

  // Secrets (wrangler secret put)
  TOKEN_ENCRYPTION_KEY: string;
  JWT_SECRET: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_REDIRECT_URI?: string;
  THREADS_APP_ID?: string;
  THREADS_APP_SECRET?: string;
  THREADS_REDIRECT_URI?: string;
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  REDDIT_REDIRECT_URI?: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  X_REDIRECT_URI?: string;
}

/** Message sent through the publish queue (replaces the poll-claim loop). */
export interface PublishJob {
  postId: string;
  attempt: number;
}
