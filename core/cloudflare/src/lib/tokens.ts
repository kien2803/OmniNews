import type { Env } from '../env';
import type { AccountsRepo } from '../repos/accounts';
import type { AccountRow } from '../repos/types';
import { decrypt, encrypt } from './crypto';

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface RefreshedTokens {
  access_token: string;
  expires_at: number;
  refresh_token?: string;
}

async function refreshThreadsToken(env: Env, accessToken: string): Promise<RefreshedTokens> {
  const u = new URL('https://graph.threads.net/refresh_access_token');
  u.searchParams.set('grant_type', 'th_refresh_token');
  u.searchParams.set('access_token', accessToken);
  const res = await fetch(u);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new Error('threads_refresh_failed');
  return { access_token: json.access_token, expires_at: Date.now() + (json.expires_in ?? 5184000) * 1000 };
}

async function refreshRedditToken(env: Env, refreshToken: string): Promise<RefreshedTokens> {
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`)}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'omninews/1.0',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new Error('reddit_refresh_failed');
  return { access_token: json.access_token, expires_at: Date.now() + (json.expires_in ?? 3600) * 1000 };
}

async function refreshXToken(env: Env, refreshToken: string): Promise<RefreshedTokens> {
  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new Error('x_refresh_failed');
  return {
    access_token: json.access_token,
    expires_at: Date.now() + (json.expires_in ?? 7200) * 1000,
    refresh_token: json.refresh_token,
  };
}

/**
 * Decrypt the account's access token, refreshing via its refresh token
 * when it has expired (or is inside the 60s skew buffer).
 *
 * Per-platform behaviour:
 *   facebook — page tokens are long-lived (~60d) with no refresh grant;
 *              an expired token throws so the user reconnects.
 *   threads  — th_refresh_token grant against the current access token.
 *   reddit   — OAuth2 refresh grant (Basic client auth).
 *   x        — OAuth2 refresh grant; X rotates the refresh token so the
 *              new value is persisted alongside the access token.
 *
 * Throws 'token_refresh_failed' on any refresh failure.
 */
export async function usableAccessToken(env: Env, accounts: AccountsRepo, row: AccountRow): Promise<string> {
  if (row.oauth_access_token && row.token_expires_at && row.token_expires_at > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    try {
      return await decrypt(row.oauth_access_token, env.TOKEN_ENCRYPTION_KEY);
    } catch {
      /* fall through to refresh */
    }
  }
  // A stored access token with no recorded expiry — rows created before
  // token_expires_at was tracked. Use it until the API says no.
  if (row.oauth_access_token && !row.token_expires_at) {
    try {
      return await decrypt(row.oauth_access_token, env.TOKEN_ENCRYPTION_KEY);
    } catch {
      /* fall through */
    }
  }
  const refresh = await decrypt(row.oauth_refresh_token, env.TOKEN_ENCRYPTION_KEY);
  let tokens: RefreshedTokens;
  if (row.platform === 'threads') {
    // oauth_refresh_token holds the long-lived token captured at connect —
    // th_refresh_token exchanges a *current* token, not a separate grant.
    tokens = await refreshThreadsToken(env, refresh).catch((e) => {
      throw new Error(`token_refresh_failed: ${e instanceof Error ? e.message : e}`);
    });
  } else if (row.platform === 'reddit') {
    tokens = await refreshRedditToken(env, refresh).catch((e) => {
      throw new Error(`token_refresh_failed: ${e instanceof Error ? e.message : e}`);
    });
  } else if (row.platform === 'x') {
    tokens = await refreshXToken(env, refresh).catch((e) => {
      throw new Error(`token_refresh_failed: ${e instanceof Error ? e.message : e}`);
    });
  } else {
    // Facebook page tokens can't be refreshed via OAuth — reconnect.
    throw new Error('token_refresh_failed: facebook token expired — reconnect account');
  }
  await accounts.updateTokens(row.id, {
    access_token: await encrypt(tokens.access_token, env.TOKEN_ENCRYPTION_KEY),
    refresh_token: tokens.refresh_token
      ? await encrypt(tokens.refresh_token, env.TOKEN_ENCRYPTION_KEY)
      : undefined,
    expires_at: tokens.expires_at,
  });
  return tokens.access_token;
}
