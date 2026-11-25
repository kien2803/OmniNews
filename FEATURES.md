# Features — OmniNews

Trạng thái tính năng theo stack deploy hiện tại (Cloudflare Workers + D1). Stack legacy Fastify (`core/api`, `core/worker`) không còn serve production.

> Pivot 2026-11: content unit = **articles** (title + body + link + image URLs), platforms = **facebook, threads, reddit, x**. Video code đã bị thay thế (migration 0008).

## Điều hướng & Shell

- **Dock macOS dưới đáy** — nav duy nhất trên PC lẫn mobile: icon scale on hover/focus, tooltip, active dot, responsive không tràn màn hẹp
- Topbar: page title · **Create Post** global action · env chip · user · theme toggle
- PostsNav tabs: Calendar · Pipeline · History
- IBM Plex type family duy nhất (Sans UI + Mono data) · light/dark theme hoàn chỉnh

## Pages

| Route | Tính năng |
|---|---|
| `/dashboard` | KPI strip (scheduled/published/failed/channels) · channel lineup CH-01–04 · quota tiles · quick actions |
| `/library` | Articles library: danh sách bài viết (title/body/link/images) · search · **Compose** → `/posts/new?article=id` · edit · delete |
| `/posts/new` | **Editorial composer**: Story (pick/write article) → Desks (platform account picker) → **Desk copies** (per-account variant editor + **AI Repurposing Studio**: per-desk Generate/Regenerate/Copy/Restore, tone + language, `ai draft`/`offline draft` badge, live platform preview, per-account validation) → Deadline (datetime + notes) → Proof (validation gate + file) |
| `/posts/calendar` | Week (cột ngày) + Month view · filter platform/account/status · quick schedule `+` · detail drawer (edit/cancel/reschedule) · drag-drop pending posts |
| `/posts/pipeline` | Kanban: drafts → scheduled → publishing → published → failed · search `q` · card actions (retry/duplicate) · bulk select + bulk actions · detail drawer |
| `/posts/history` | Danh sách published/failed · filter + search · link external_post_id |
| `/accounts` | Danh sách + connect OAuth (Facebook/Threads/Reddit/X) · status badge · card/table · publish target (subreddit) |
| `/analytics` | Per-account rollups · date range: today/month/year/custom · drill-down channel |
| `/settings` | Profile · change password (revoke sessions khác) · danger zone delete account |

## Auth & Security

- JWT 7d + **token_version revocation** (change-password + `/auth/logout-all`)
- Password ≥8 chars + letter + digit (register + change)
- **D1 rate limit**: login 10/min/IP · register 5/min/IP → 429 + Retry-After
- Ownership check mọi route (user_id scoped) · CORS same-origin
- Sentry `beforeSend` scrub: strip auth/cookie headers, redact token params
- Token OAuth platform mã hóa (`TOKEN_ENCRYPTION_KEY`)

## Publishing pipeline (backend)

- Cron mỗi phút: claim `pending` đến hạn → `uploading` → enqueue
- Queue consumer + **DLQ → markDead** · dedupe (`external_post_id` → skip) · bounded `MAX_PUBLISH_ATTEMPTS=5`
- **Reconciliation**: post kẹt `uploading` >10min → về `pending`
- `POST /schedule/:id/retry` — failed/dead → pending
- Error classification `lib/publishErrors` (permanent vs retryable) sẵn cho publisher port
- Worker heartbeat `meta.last_cron_at` — `/health` báo `worker_lag_sec`, stale >5min → degraded 503
- `MOCK_PUBLISHERS=true` → publishers trả `mock_*` external ids (UI badge `mock` ở History/drawer — không giả làm post thật)

## AI Repurposing Studio

- `POST /api/generate` — per-account variant drafting (rate-limited 20/min, auth + ownership checks)
- Provider abstraction `lib/ai.ts`: `AI_PROVIDER=anthropic|openai` + `AI_API_KEY` secret — server-side only
- Không có AI creds → deterministic offline drafter (`source:'offline'`, UI badge `offline draft`) — reshape story, không bịa nội dung
- Response kèm `validation` (shared `validatePost`) — draft lỗi vẫn hiện issues trước khi file

## Data features

- **Drafts**: `status='draft'` · save từ composer · edit/schedule/delete trong drawer · drafts lane pipeline · không lọt calendar
- **Notes**: `notes` per post (migration 0005)
- **Quota**: global platform cap + `quota_usage` per-user (`mine` trong `/api/quota`)
- Search: `GET /schedule?q=` (caption LIKE)
- Analytics range: `?from=&to=` trên scheduled_at
- Migrations: `0001` → `0011` (meta, quota, auth_hardening, drafts/notes, comments, articles pivot 0008, account target 0009, post variants 0011)

## Ops

- CI: typecheck + lint + test + `docker build` (`.github/workflows/ci.yml`)
- `scripts/backup-db.sh` — D1 export timestamped
- Tests: web 32 · worker 44

## Chưa hoàn thiện (blocked)

- OAuth credentials thật cho 4 platforms — chờ client ids/secrets (X app đang setup)
- Reddit API access bị gate bởi Responsible Builder Policy registration
- Roadmap chưa làm: post templates, media folders, activity log, notifications, multi-tenant/billing
