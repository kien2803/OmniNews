import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { AccountsRepo } from '../repos/accounts';
import { userIdFromToken } from '../lib/auth';
import { encrypt } from '../lib/crypto';
import { generatePKCE } from '../lib/pkce';
import type { Platform } from '../repos/types';
import type { Env } from '../env';

export const oauthRoutes = new Hono<{ Bindings: Env }>();

function cookieOpts(env: Env) {
  const secure = env.WEB_ORIGIN.startsWith('https://');
  return { path: '/auth', httpOnly: true, sameSite: 'Lax' as const, secure, maxAge: 600 };
}

async function cookieUserId(c: { req: { raw: Request }; env: Env }): Promise<string | null> {
  const t = getCookie({ req: c.req } as never, 'oauth_token');
  if (!t) return null;
  return userIdFromToken(c, t);
}

/** Shared callback preflight: state check + session cookie → userId. */
async function callbackPreflight(c: {
  req: { query: () => Record<string, string | undefined>; raw: Request };
  env: Env;
  redirect: (u: string) => Response;
}) {
  const { code, state, error } = c.req.query();
  const savedState = getCookie({ req: c.req } as never, 'oauth_state');
  deleteCookie(c as never, 'oauth_state', { path: '/auth' });
  const origin = c.env.WEB_ORIGIN;
  if (error) return { error: c.redirect(`${origin}/accounts?error=${encodeURIComponent(error)}`) } as const;
  if (!code || !state || state !== savedState) {
    return { error: c.redirect(`${origin}/accounts?error=state_mismatch`) } as const;
  }
  const userId = await cookieUserId(c as never);
  deleteCookie(c as never, 'oauth_token', { path: '/auth' });
  if (!userId) return { error: c.redirect(`${origin}/login`) } as const;
  return { code, userId, origin } as const;
}

/** Upsert one connected account row; redirects when the external account
 *  already belongs to a different user. */
async function upsertAccount(
  c: { env: Env },
  userId: string,
  input: {
    platform: Platform;
    externalId: string;
    displayName: string;
    accessToken: string | null;
    refreshToken: string;
    expiresAt: number | null;
    channelHandle?: string;
    avatarUrl?: string;
  },
): Promise<{ id: string } | { error: 'account_owned_by_other_user' }> {
  const accounts = new AccountsRepo(c.env.DB);
  const encRefresh = await encrypt(input.refreshToken, c.env.TOKEN_ENCRYPTION_KEY);
  const encAccess = input.accessToken ? await encrypt(input.accessToken, c.env.TOKEN_ENCRYPTION_KEY) : null;
  const existing = await accounts.findByPlatformExternal(input.platform, input.externalId);
  if (existing) {
    if (existing.user_id !== userId) return { error: 'account_owned_by_other_user' };
    await accounts.updateTokens(existing.id, {
      access_token: encAccess ?? undefined,
      refresh_token: encRefresh,
      expires_at: input.expiresAt,
    });
    await accounts.updateDisplayName(existing.id, input.displayName);
    await accounts.updateStatus(existing.id, 'active');
    await accounts.updateChannelSnapshot(existing.id, {
      channel_handle: input.channelHandle ?? '',
      avatar_url: input.avatarUrl ?? '',
      last_sync_at: Date.now(),
    });
    return { id: existing.id };
  }
  const row = await accounts.insert({
    user_id: userId,
    platform: input.platform,
    external_id: input.externalId,
    display_name: input.displayName,
    oauth_refresh_token: encRefresh,
    oauth_access_token: encAccess,
    token_expires_at: input.expiresAt,
  });
  await accounts.updateChannelSnapshot(row.id, {
    channel_handle: input.channelHandle ?? '',
    avatar_url: input.avatarUrl ?? '',
    last_sync_at: Date.now(),
  });
  return { id: row.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Facebook — Meta dialog → creates one row per managed Page.
// ──────────────────────────────────────────────────────────────────────────

const META_SCOPES = ['public_profile', 'pages_show_list', 'pages_manage_posts', 'pages_read_engagement'].join(',');

function metaGraph(c: { env: Env }, path: string, params: Record<string, string>): string {
  const v = c.env.META_API_VERSION || 'v24.0';
  const url = new URL(`https://graph.facebook.com/${v}${path}`);
  for (const [k, val] of Object.entries(params)) url.searchParams.set(k, val);
  return url.toString();
}

oauthRoutes.get('/auth/facebook/start', (c) => {
  if (!c.env.META_APP_ID || !c.env.META_APP_SECRET || !c.env.META_REDIRECT_URI) {
    return c.json({ error: 'Facebook OAuth not configured' }, 503);
  }
  const state = crypto.randomUUID();
  setCookie(c, 'oauth_state', state, cookieOpts(c.env));
  const v = c.env.META_API_VERSION || 'v24.0';
  const url = new URL(`https://www.facebook.com/${v}/dialog/oauth`);
  url.searchParams.set('client_id', c.env.META_APP_ID);
  url.searchParams.set('redirect_uri', c.env.META_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', META_SCOPES);
  url.searchParams.set('response_type', 'code');
  return c.redirect(url.toString());
});

oauthRoutes.get('/auth/meta/callback', async (c) => {
  const pre = await callbackPreflight(c);
  if ('error' in pre) return pre.error;
  const { code, userId, origin } = pre;

  const exRes = await fetch(
    metaGraph(c, '/oauth/access_token', {
      client_id: c.env.META_APP_ID!,
      client_secret: c.env.META_APP_SECRET!,
      redirect_uri: c.env.META_REDIRECT_URI!,
      code,
    }),
  );
  if (!exRes.ok) return c.redirect(`${origin}/accounts?error=token_exchange_failed`);
  const ex = (await exRes.json()) as { access_token?: string };
  if (!ex.access_token) return c.redirect(`${origin}/accounts?error=token_exchange_failed`);

  let durable = ex.access_token;
  let expiresAt: number | null = null;
  try {
    const llRes = await fetch(
      metaGraph(c, '/oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: c.env.META_APP_ID!,
        client_secret: c.env.META_APP_SECRET!,
        fb_exchange_token: ex.access_token,
      }),
    );
    const ll = (await llRes.json()) as { access_token?: string; expires_in?: number };
    if (ll.access_token) {
      durable = ll.access_token;
      expiresAt = ll.expires_in ? Date.now() + ll.expires_in * 1000 : null;
    }
  } catch {
    /* short-lived fallback is fine */
  }

  const pagesRes = await fetch(
    metaGraph(c, '/me/accounts', {
      access_token: durable,
      fields: 'id,name,access_token,picture',
    }),
  );
  const pagesJson = (await pagesRes.json()) as {
    data?: Array<{ id?: string; name?: string; access_token?: string; picture?: { data?: { url?: string } } }>;
  };
  const pages = (pagesJson.data ?? []).filter((p) => p.id && p.access_token);
  if (!pages.length) return c.redirect(`${origin}/accounts?error=no_pages`);

  const insertedIds: string[] = [];
  for (const p of pages) {
    const r = await upsertAccount(c, userId, {
      platform: 'facebook',
      externalId: p.id!,
      displayName: p.name ?? p.id!,
      accessToken: p.access_token!,
      // Page tokens can't OAuth-refresh — the placeholder marks the row as
      // "reconnect required" once token_expires_at passes.
      refreshToken: `facebook-page-${p.id}`,
      expiresAt,
      channelHandle: p.name ?? '',
      avatarUrl: p.picture?.data?.url,
    });
    if ('error' in r) return c.redirect(`${origin}/accounts?error=${r.error}`);
    insertedIds.push(r.id);
  }
  return c.redirect(`${origin}/accounts?connected=facebook&accounts=${insertedIds.join(',')}`);
});

// ──────────────────────────────────────────────────────────────────────────
// Threads — Meta's Threads API (separate app credentials + long-lived token).
// ──────────────────────────────────────────────────────────────────────────

const THREADS_SCOPES = 'threads_basic,threads_content_publish';

oauthRoutes.get('/auth/threads/start', (c) => {
  if (!c.env.THREADS_APP_ID || !c.env.THREADS_APP_SECRET || !c.env.THREADS_REDIRECT_URI) {
    return c.json({ error: 'Threads OAuth not configured' }, 503);
  }
  const state = crypto.randomUUID();
  setCookie(c, 'oauth_state', state, cookieOpts(c.env));
  const url = new URL('https://threads.net/oauth/authorize');
  url.searchParams.set('client_id', c.env.THREADS_APP_ID);
  url.searchParams.set('redirect_uri', c.env.THREADS_REDIRECT_URI);
  url.searchParams.set('scope', THREADS_SCOPES);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return c.redirect(url.toString());
});

oauthRoutes.get('/auth/threads/callback', async (c) => {
  const pre = await callbackPreflight(c);
  if ('error' in pre) return pre.error;
  const { code, userId, origin } = pre;

  const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.env.THREADS_APP_ID!,
      client_secret: c.env.THREADS_APP_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: c.env.THREADS_REDIRECT_URI!,
      code,
    }),
  });
  const short = (await tokenRes.json()) as { access_token?: string; user_id?: number };
  if (!tokenRes.ok || !short.access_token) {
    return c.redirect(`${origin}/accounts?error=token_exchange_failed`);
  }

  // Short-lived (~1h) → long-lived (~60d) token.
  let durable = short.access_token;
  let expiresAt: number | null = null;
  try {
    const llRes = await fetch(
      `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(c.env.THREADS_APP_SECRET!)}&access_token=${encodeURIComponent(short.access_token)}`,
    );
    const ll = (await llRes.json()) as { access_token?: string; expires_in?: number };
    if (ll.access_token) {
      durable = ll.access_token;
      expiresAt = ll.expires_in ? Date.now() + ll.expires_in * 1000 : null;
    }
  } catch {
    /* short-lived fallback is fine */
  }

  const meRes = await fetch(
    `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${encodeURIComponent(durable)}`,
  );
  const me = (await meRes.json()) as { id?: string; username?: string; threads_profile_picture_url?: string };
  if (!me.id) return c.redirect(`${origin}/accounts?error=no_threads_user`);

  const r = await upsertAccount(c, userId, {
    platform: 'threads',
    externalId: me.id,
    displayName: me.username ? `@${me.username}` : me.id,
    accessToken: durable,
    // The long-lived token doubles as the refresh input (th_refresh_token
    // exchanges a current token, not a separate refresh grant).
    refreshToken: durable,
    expiresAt,
    channelHandle: me.username ?? '',
    avatarUrl: me.threads_profile_picture_url,
  });
  if ('error' in r) return c.redirect(`${origin}/accounts?error=${r.error}`);
  return c.redirect(`${origin}/accounts?connected=threads&account=${r.id}`);
});

// ──────────────────────────────────────────────────────────────────────────
// Reddit — OAuth2 with permanent duration (submit to the user's profile).
// ──────────────────────────────────────────────────────────────────────────

const REDDIT_SCOPES = 'identity submit read';

function redditBasic(env: Env): string {
  return `Basic ${btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`)}`;
}

oauthRoutes.get('/auth/reddit/start', (c) => {
  if (!c.env.REDDIT_CLIENT_ID || !c.env.REDDIT_CLIENT_SECRET || !c.env.REDDIT_REDIRECT_URI) {
    return c.json({ error: 'Reddit OAuth not configured' }, 503);
  }
  const state = crypto.randomUUID();
  setCookie(c, 'oauth_state', state, cookieOpts(c.env));
  // The user's browser must reach this host — www.reddit.com is
  // ISP-blocked in some regions (e.g. VN), where old.reddit.com serves
  // the same consent UI. Configurable per-environment via var.
  const authorizeBase = c.env.REDDIT_AUTHORIZE_URL ?? 'https://www.reddit.com/api/v1/authorize';
  const url = new URL(authorizeBase);
  url.searchParams.set('client_id', c.env.REDDIT_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', c.env.REDDIT_REDIRECT_URI);
  url.searchParams.set('duration', 'permanent');
  url.searchParams.set('scope', REDDIT_SCOPES);
  return c.redirect(url.toString());
});

oauthRoutes.get('/auth/reddit/callback', async (c) => {
  const pre = await callbackPreflight(c);
  if ('error' in pre) return pre.error;
  const { code, userId, origin } = pre;

  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: redditBasic(c.env),
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'omninews/1.0',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: c.env.REDDIT_REDIRECT_URI!,
    }),
  });
  const tokens = (await tokenRes.json()) as {
    access_token?: string; refresh_token?: string; expires_in?: number; error?: string;
  };
  if (!tokenRes.ok || !tokens.access_token || !tokens.refresh_token) {
    return c.redirect(`${origin}/accounts?error=${encodeURIComponent(tokens.error ?? 'token_exchange_failed')}`);
  }

  const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: { authorization: `Bearer ${tokens.access_token}`, 'user-agent': 'omninews/1.0' },
  });
  const me = (await meRes.json()) as { id?: string; name?: string; icon_img?: string };
  if (!me.name) return c.redirect(`${origin}/accounts?error=no_reddit_user`);

  const r = await upsertAccount(c, userId, {
    platform: 'reddit',
    externalId: me.name,
    displayName: `u/${me.name}`,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    channelHandle: me.name,
    avatarUrl: me.icon_img?.split('?')[0],
  });
  if ('error' in r) return c.redirect(`${origin}/accounts?error=${r.error}`);
  return c.redirect(`${origin}/accounts?connected=reddit&account=${r.id}`);
});

// ──────────────────────────────────────────────────────────────────────────
// X (Twitter) — OAuth2 + PKCE S256; offline.access yields a refresh token.
// ──────────────────────────────────────────────────────────────────────────

const X_SCOPES = 'tweet.read tweet.write users.read offline.access';

oauthRoutes.get('/auth/x/start', async (c) => {
  if (!c.env.X_CLIENT_ID || !c.env.X_CLIENT_SECRET || !c.env.X_REDIRECT_URI) {
    return c.json({ error: 'X OAuth not configured' }, 503);
  }
  const state = crypto.randomUUID();
  const { verifier, challenge } = await generatePKCE();
  const opts = cookieOpts(c.env);
  setCookie(c, 'oauth_state', state, opts);
  setCookie(c, 'x_code_verifier', verifier, opts);
  const url = new URL('https://twitter.com/i/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', c.env.X_CLIENT_ID);
  url.searchParams.set('redirect_uri', c.env.X_REDIRECT_URI);
  url.searchParams.set('scope', X_SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return c.redirect(url.toString());
});

oauthRoutes.get('/auth/x/callback', async (c) => {
  const verifier = getCookie({ req: c.req } as never, 'x_code_verifier');
  deleteCookie(c, 'x_code_verifier', { path: '/auth' });
  const pre = await callbackPreflight(c);
  if ('error' in pre) return pre.error;
  const { code, userId, origin } = pre;
  if (!verifier) return c.redirect(`${origin}/accounts?error=missing_code_verifier`);

  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${c.env.X_CLIENT_ID}:${c.env.X_CLIENT_SECRET}`)}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: c.env.X_REDIRECT_URI!,
      code_verifier: verifier,
    }),
  });
  const tokens = (await tokenRes.json()) as {
    access_token?: string; refresh_token?: string; expires_in?: number; error?: string;
  };
  if (!tokenRes.ok || !tokens.access_token) {
    return c.redirect(`${origin}/accounts?error=${encodeURIComponent(tokens.error ?? 'token_exchange_failed')}`);
  }

  const meRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const meJson = (await meRes.json()) as { data?: { id?: string; username?: string; name?: string; profile_image_url?: string } };
  const me = meJson.data;
  if (!me?.id) return c.redirect(`${origin}/accounts?error=no_x_user`);

  const r = await upsertAccount(c, userId, {
    platform: 'x',
    externalId: me.id,
    displayName: me.username ? `@${me.username}` : (me.name ?? me.id),
    accessToken: tokens.access_token,
    // X only issues a refresh token when offline.access was granted —
    // without it the row dies at expiry and the user reconnects.
    refreshToken: tokens.refresh_token ?? `x-norefresh-${me.id}`,
    expiresAt: Date.now() + (tokens.expires_in ?? 7200) * 1000,
    channelHandle: me.username ?? '',
    avatarUrl: me.profile_image_url,
  });
  if ('error' in r) return c.redirect(`${origin}/accounts?error=${r.error}`);
  return c.redirect(`${origin}/accounts?connected=x&account=${r.id}`);
});

// ──────────────────────────────────────────────────────────────────────────
// Per-platform status — bearer-auth, user-scoped.
// ──────────────────────────────────────────────────────────────────────────

const PLATFORM_CONFIGURED: Record<Platform, (env: Env) => boolean> = {
  facebook: (env) => !!env.META_APP_ID,
  threads: (env) => !!env.THREADS_APP_ID,
  reddit: (env) => !!env.REDDIT_CLIENT_ID,
  x: (env) => !!env.X_CLIENT_ID,
};

for (const platform of ['facebook', 'threads', 'reddit', 'x'] as const) {
  oauthRoutes.get(`/auth/${platform}/status`, async (c) => {
    const h = c.req.header('authorization');
    if (!h?.startsWith('Bearer ')) return c.json({ connected: false }, 401);
    const userId = await userIdFromToken(c, h.slice(7));
    if (!userId) return c.json({ connected: false }, 401);
    const rows = await new AccountsRepo(c.env.DB).listByPlatform(platform, userId);
    return c.json({
      connected: rows.length > 0,
      configured: PLATFORM_CONFIGURED[platform](c.env),
      accounts: rows.map((r) => ({ id: r.id, platform, display_name: r.display_name, status: r.status })),
    });
  });
}
