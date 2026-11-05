# OmniNews

SaaS social-media automation — viết bài một lần, schedule, publish lên Facebook / Threads / Reddit / X từ một nơi.

> Project độc lập — fork/mở rộng từ OmniCast (video scheduler) nhưng deploy,
> database, queues và domain riêng. Không chia sẻ D1/Queue với OmniCast.

**Live**: https://omnicast.trunkynw2803.workers.dev

> Proprietary — all rights reserved. Không phải self-hosted product; codebase private.

## Stack

| Tầng | Công nghệ |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind · TanStack Query · Day.js |
| Backend | Hono trên Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Queue | Cloudflare Queues + DLQ + cron `*/1 * * * *` |
| Content | Articles (title + body + link + image URLs) — không cần binary storage |
| Auth | JWT + bcrypt · token_version revocation · D1 rate limiting |

## Cấu trúc

```
core/
  web/          # SPA — pages, components, dock nav
  cloudflare/   # worker: routes, repos, cron, queue consumer, migrations
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
`GET /schedule?status&account_id&from&to&q` · `GET/POST /articles` · `GET/PATCH/DELETE /articles/:id` · `GET /history`
`GET /dashboard/counts` · `GET /analytics?account_id&from&to` · `GET /quota` (global + `mine`)
`GET /health` (DB ping + worker heartbeat)

## Blockers (cần thao tác developer console)

- **Meta credentials** — `META_APP_ID/SECRET` (Business app + pages_manage_posts) cho Facebook
- **Threads credentials** — `THREADS_APP_ID/SECRET` (Threads API app)
- **Reddit credentials** — `REDDIT_CLIENT_ID/SECRET` (reddit.com/prefs/apps)
- **X credentials** — `X_CLIENT_ID/SECRET` (developer portal, OAuth2 + offline.access)

Bài viết cũ dạng video được migration 0008 mark `dead` (`legacy_video_post`);
bảng `videos` giữ nguyên làm archive, không còn code nào đọc.

Chi tiết tính năng: [FEATURES.md](FEATURES.md)
