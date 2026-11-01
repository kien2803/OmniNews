# Omnicast

SaaS social-media automation — upload video, schedule posts, publish lên YouTube / TikTok / Instagram / Facebook từ một nơi.

**Live**: https://omnicast.trunkynw2803.workers.dev

> Proprietary — all rights reserved. Không phải self-hosted product; codebase private.

## Stack

| Tầng | Công nghệ |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind · TanStack Query · Day.js |
| Backend | Hono trên Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Queue | Cloudflare Queues + DLQ + cron `*/1 * * * *` |
| Storage | Cloudflare R2 (chưa bật — xem phần Blockers) |
| Auth | JWT + bcrypt · token_version revocation · D1 rate limiting |

## Cấu trúc

```
core/
  web/          # SPA — pages, components, dock nav
  cloudflare/   # worker: routes, repos, cron, queue consumer, migrations
  api/          # legacy Fastify API (không deploy — giữ cho tests/reference)
  worker/       # legacy publishing worker (reference impl cho publisher port)
  packages/
    shared/     # row types dùng chung
scripts/
  backup-db.sh  # wrangler d1 export → backups/
.github/workflows/ci.yml  # typecheck + lint + test + docker build
```

## Dev

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
cd core/cloudflare && ./node_modules/.bin/wrangler deploy
```

## Routes (SPA)

```
/dashboard /library /posts/new /posts/calendar /posts/pipeline /posts/history
/accounts /analytics /settings
Legacy redirects: /upload /schedule /calendar /pipeline /history → /posts/*
```

## API chính

`POST /auth/register` `POST /auth/login` (rate-limited) · `GET/PATCH/DELETE /auth/me`
`POST /auth/change-password` (revokes old tokens) · `POST /auth/logout-all`
`GET/POST /schedule` · `GET/PATCH/DELETE /schedule/:id` · `POST /schedule/:id/retry`
`GET /schedule?status&account_id&from&to&q` · `GET /videos` · `GET /history`
`GET /dashboard/counts` · `GET /analytics?account_id&from&to` · `GET /quota` (global + `mine`)
`GET /health` (DB ping + worker heartbeat)

## Blockers (cần thao tác Cloudflare/developer console)

- **R2 billing** — chưa enable → `POST /videos` + publisher port đang chờ
- **TikTok credentials** — `TIKTOK_CLIENT_KEY/SECRET` (dev app + Content Posting review)
- **Meta credentials** — `META_APP_ID/SECRET` (Business app + Advanced Access)

Chi tiết tính năng: [FEATURES.md](FEATURES.md)
