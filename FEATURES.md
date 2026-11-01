# Features — Omnicast

Trạng thái tính năng theo stack deploy hiện tại (Cloudflare Workers + D1). Stack legacy Fastify (`core/api`, `core/worker`) không còn serve production.

## Điều hướng & Shell

- **Dock macOS dưới đáy** — nav duy nhất trên PC lẫn mobile: icon scale on hover/focus, tooltip, active dot, responsive không tràn màn hẹp
- Topbar: page title · **Create Post** global action · env chip · user · theme toggle
- PostsNav tabs: Calendar · Pipeline · History
- IBM Plex type family duy nhất (Sans UI + Mono data) · light/dark theme hoàn chỉnh

## Pages

| Route | Tính năng |
|---|---|
| `/dashboard` | KPI strip (scheduled/published/failed/channels) · channel lineup CH-01–04 · quota tiles · quick actions |
| `/library` | Content Library: grid/list toggle · search · thumbnail · duration/size/date · upload · preview modal · **Create Post** → `/posts/new?video=id` · delete |
| `/posts/new` | **Unified composer** 5 section 1 trang: Media (picker + inline upload + replace) → Accounts (platform groups, select-all-active, nhớ selection) → Caption (shared + per-platform toggle + counter) → Options (datetime + timezone + visibility + notes) → Review (validation + confirm) |
| `/posts/calendar` | Week (cột ngày) + Month view · filter platform/account/status · quick schedule `+` · detail drawer (edit/cancel/reschedule) · drag-drop pending posts |
| `/posts/pipeline` | Kanban: drafts → scheduled → publishing → published → failed · search `q` · card actions (retry/duplicate) · bulk select + bulk actions · detail drawer |
| `/posts/history` | Danh sách published/failed · filter + search · link external_post_id |
| `/accounts` | Danh sách + connect OAuth (YouTube/TikTok/Meta routes) · status badge · card/table |
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
- Consumer fail-fast `publisher_not_deployed` cho tới khi R2 mở

## Data features

- **Drafts**: `status='draft'` · save từ composer · edit/schedule/delete trong drawer · drafts lane pipeline · không lọt calendar
- **Notes**: `notes` per post (migration 0005)
- **Quota**: global platform cap + `quota_usage` per-user (`mine` trong `/api/quota`)
- Search: `GET /schedule?q=` (caption LIKE)
- Analytics range: `?from=&to=` trên scheduled_at
- Migrations: `0001_init` → `0005_drafts_notes` (meta, quota_usage, auth_hardening, drafts/notes)

## Ops

- CI: typecheck + lint + test + `docker build` (`.github/workflows/ci.yml`)
- `scripts/backup-db.sh` — D1 export timestamped
- Tests: web 24 · worker 67 · api 156

## Chưa hoàn thiện (blocked)

- `POST /videos` upload + publisher dispatch + Facebook streaming + Instagram public URL — chờ **R2 billing**
- TikTok/Meta OAuth verify bằng account thật — chờ credentials
- Roadmap chưa làm: post templates, media folders, activity log, notifications, multi-tenant/billing
