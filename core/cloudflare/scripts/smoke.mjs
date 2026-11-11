#!/usr/bin/env node
/**
 * OmniNews backend smoke test — exercises the whole publish path against a
 * running dev worker (default http://127.0.0.1:5182, MOCK_PUBLISHERS=true).
 *
 *   pnpm smoke
 *   SMOKE_BASE=http://x SMOKE_EMAIL=a SMOKE_PASSWORD=b pnpm smoke
 *
 * Covers: health, auth, article CRUD, accounts, scheduling, cron claim,
 * queue publish, quota, comments. Exits non-zero on any failure.
 *
 * Note: scheduling enforces a 60s lead time, so the publish leg waits for
 * the next cron tick (~70–150s total run).
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5182';
const EMAIL = process.env.SMOKE_EMAIL || 'desk@omninews.dev';
const PASSWORD = process.env.SMOKE_PASSWORD || 'OmniNews-Test-2026';
const CRON_URL = `${BASE}/cdn-cgi/handler/scheduled?cron=*/1+*+*+*+*`;

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const api = async (path, { method = 'GET', token, body } = {}) => {
  try {
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, json };
  } catch (e) {
    // Transient network failure — caller decides whether it's fatal.
    return { status: 0, json: null, error: e instanceof Error ? e.message : String(e) };
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`smoke → ${BASE} (${EMAIL})\n`);

// ── health ──────────────────────────────────────────────────────────
{
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(15_000) });
    const j = await res.json().catch(() => ({}));
    check('health', res.status === 200 && j.status === 'ok', `${res.status} ${j.status ?? ''}`);
  } catch (e) {
    check('health', false, `unreachable: ${e instanceof Error ? e.message : e}`);
    console.log('\nbase URL unreachable — aborting');
    process.exit(1);
  }
}

// ── auth ────────────────────────────────────────────────────────────
let token;
{
  const bad = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: 'wrong-pw-1' } });
  check('login rejects wrong password', bad.status === 401, `${bad.status}`);
  const noAuth = await api('/auth/me');
  check('/auth/me requires token', noAuth.status === 401, `${noAuth.status}`);
  const ok = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  token = ok.json?.token;
  check('login', ok.status === 200 && !!token, `${ok.status}`);
  const me = await api('/auth/me', { token });
  check('/auth/me', me.status === 200 && me.json?.email === EMAIL, `${me.status} ${me.json?.email ?? ''}`);
}
if (!token) {
  console.log('\nno token — aborting');
  process.exit(1);
}

// ── articles CRUD ───────────────────────────────────────────────────
let articleId;
{
  const empty = await api('/articles', { method: 'POST', token, body: {} });
  check('create article rejects empty body', empty.status === 400, `${empty.status}`);
  const created = await api('/articles', {
    method: 'POST', token,
    body: { title: 'smoke story', body: `smoke ${Date.now()}`, link: 'https://example.com/a' },
  });
  articleId = created.json?.article?.id;
  check('create article', created.status === 201 && !!articleId, `${created.status}`);
  const list = await api('/articles', { token });
  check('list articles', list.status === 200 && list.json?.articles?.some((a) => a.id === articleId), `${list.status}`);
  const got = await api(`/articles/${articleId}`, { token });
  check('get article', got.status === 200 && got.json?.article?.id === articleId, `${got.status}`);
  const patched = await api(`/articles/${articleId}`, { method: 'PATCH', token, body: { title: 'smoke story v2' } });
  check('patch article', patched.status === 200 && patched.json?.article?.title === 'smoke story v2', `${patched.status}`);
  const ghost = await api('/articles/does-not-exist', { token });
  check('missing article → 404', ghost.status === 404, `${ghost.status}`);
}

// ── accounts ────────────────────────────────────────────────────────
let accounts = [];
{
  const r = await api('/accounts', { token });
  accounts = r.json?.accounts ?? [];
  check('list accounts', r.status === 200 && accounts.length >= 1, `${r.status} ${accounts.length} desks`);
  for (const a of accounts) console.log(`      · ${a.platform} ${a.display_name ?? ''} (${a.status})`);
}

// ── schedule → cron → queue → publish ───────────────────────────────
// scheduled_at must be ≥60s out; the next cron tick claims it once due.
// SMOKE_SKIP_PUBLISH=1 skips the publish leg — remote dev has no queue
// consumers, so posts would sit 'uploading' until the poll deadline.
const publishOk = articleId && accounts.length && process.env.SMOKE_SKIP_PUBLISH !== '1';
let posts = [];
if (process.env.SMOKE_SKIP_PUBLISH === '1') {
  console.log('  · schedule/publish path — skipped (SMOKE_SKIP_PUBLISH=1)');
} else if (publishOk) {
  const when = Date.now() + 61_000;
  const created = await api('/schedule', {
    method: 'POST', token,
    body: { article_id: articleId, account_ids: accounts.map((a) => a.id), scheduled_at: when },
  });
  posts = created.json?.posts ?? [];
  check(`schedule ${accounts.length} post(s)`, created.status === 201 && posts.length === accounts.length, `${created.status}`);
  const leadReject = await api('/schedule', {
    method: 'POST', token,
    body: { article_id: articleId, account_ids: [accounts[0].id], scheduled_at: Date.now() },
  });
  check('lead-time enforced (<60s rejected)', leadReject.status === 400, `${leadReject.status}`);

  // Prime the queue: the due tick claims + enqueues. Triggering now claims
  // nothing (post isn't due) — the run relies on the real :00 boundary.
  const deadline = Date.now() + 150_000;
  const byAccount = Object.fromEntries(accounts.map((a) => [a.id, a.platform]));
  while (Date.now() < deadline) {
    let allDone = true;
    for (const p of posts) {
      const r = await api(`/schedule/${p.id}`, { token });
      p._status = r.json?.status;
      p._ext = r.json?.external_post_id;
      if (!['published', 'failed', 'dead'].includes(p._status)) allDone = false;
    }
    if (allDone) break;
    await sleep(1500);
    // Nudge cron in case the dev clock tick was missed
    await fetch(CRON_URL).catch(() => {});
  }
  for (const p of posts) {
    check(`publish → ${byAccount[p.account_id] ?? p.account_id}`, p._status === 'published', `${p._status} ${p._ext ?? ''}`);
  }
} else {
  check('schedule/publish path', false, 'need ≥1 article and ≥1 account');
}

// ── quota + comments ────────────────────────────────────────────────
{
  const q = await api('/quota', { token });
  check('quota', q.status === 200 && Array.isArray(q.json?.quotas), `${q.status}`);
  const c = await api('/comments', { token });
  check('comments', c.status === 200 && Array.isArray(c.json?.comments), `${c.status}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
