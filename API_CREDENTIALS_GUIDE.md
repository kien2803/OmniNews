# API Credentials Guide

OmniNews connects 4 platforms: **Facebook, Threads, Reddit, X** — plus an optional **AI provider** for content adaptation.

Mock mode (`MOCK_PUBLISHERS=true`) fakes publisher calls with `mock_*` external ids — no credentials needed for dev/smoke. For real publishing you need OAuth credentials per platform, set as worker secrets.

Secrets are set with `wrangler secret put` (never committed). Redirect URIs live in `wrangler.toml [vars]` and **must match the platform console exactly**.

```
cd core/cloudflare
npx wrangler login
npx wrangler secret put <NAME>     # then paste the value — it is not echoed
```

---

## Facebook (Meta)

- Console: `developers.facebook.com` → Business app
- Secrets: `META_APP_ID`, `META_APP_SECRET`
- Redirect: `META_REDIRECT_URI` = `https://<worker>/auth/meta/callback`
- Scopes used: `public_profile, pages_show_list, pages_manage_posts, pages_read_engagement`
- Dev mode: works with Pages you own; other users need Meta App Review.

## Threads (Meta)

- Same Meta console — enable the Threads use-case
- Secrets: `THREADS_APP_ID`, `THREADS_APP_SECRET`
- Redirect: `THREADS_REDIRECT_URI` = `https://<worker>/auth/threads/callback`
- Scopes: `threads_basic, threads_content_publish`

## Reddit

- Console: `old.reddit.com/prefs/apps` (www is ISP-blocked in VN; `REDDIT_AUTHORIZE_URL` defaults to old.reddit.com — token/API calls still use oauth.reddit.com server-side)
- Type **web app** (script type = developer's account only)
- Secrets: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`
- Redirect: `REDDIT_REDIRECT_URI` = `https://<worker>/auth/reddit/callback`
- Scopes: `identity submit read`
- ⚠ New accounts may be gated by Reddit's Responsible Builder Policy registration.

## X (Twitter)

- Console: `developer.x.com` → Project + App → **User authentication settings**
- Type: Web App · Permissions: Read and write
- Secrets: `X_CLIENT_ID`, `X_CLIENT_SECRET` (OAuth 2.0 — *not* the API Key/Secret pair)
- Redirect: `X_REDIRECT_URI` = `https://<worker>/auth/x/callback`
- Scopes: `tweet.read tweet.write users.read offline.access` (PKCE is implemented)
- `tweet.write` needs elevated access on some tiers.

## AI provider (optional)

`POST /api/generate` adapts each story into per-platform drafts. Without credentials it uses a deterministic offline drafter (honest — labeled `offline draft` in the UI).

| Env | Value |
|---|---|
| `AI_PROVIDER` (var) | `anthropic` or `openai` |
| `AI_API_KEY` (secret) | provider API key — server-side only |
| `AI_MODEL` (var, optional) | default `claude-haiku-4-5-20251001` / `gpt-4o-mini` |
| `AI_BASE_URL` (var, optional) | OpenAI-compatible endpoint override |

```bash
npx wrangler secret put AI_API_KEY
# set AI_PROVIDER/AI_MODEL in wrangler.toml [vars]
```

---

## After credentials land

```bash
cd core/cloudflare
# flip off mock mode in wrangler.toml, then:
pnpm -F @omninews/web build && npx wrangler deploy
```

Verify: `SMOKE_BASE=https://<worker> pnpm smoke`.
