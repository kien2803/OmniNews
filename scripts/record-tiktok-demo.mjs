// Records the TikTok app-review demo video: headed Chromium + Playwright video.
// Auto-drives every app-side step; pauses once for the real TikTok OAuth login
// (the reviewer requires the actual authorize screen — sandbox only accepts the
// dev's own account, and the credentials are the user's, so a human does that).
//
// Usage: node scripts/record-tiktok-demo.mjs
// Output: /tmp/omnicast-tiktok-demo-*.webm (convert with ffmpeg afterwards)

import { chromium } from 'playwright';

const BASE = 'https://omnicast.trunkynw2803.workers.dev';
const EMAIL = `demo+${Date.now()}@omnicast.app`;
const PASSWORD = 'DemoPass1';

const slow = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: false, args: ['--window-size=1440,900'] });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: '/tmp', size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

console.log('[1] Register demo user:', EMAIL);
await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/dashboard|posts|accounts/, { timeout: 20000 }).catch(() => {});
await slow(2500);

console.log('[2] Accounts → Connect TikTok');
await page.goto(`${BASE}/accounts`, { waitUntil: 'networkidle' });
await slow(2000);
const connect = page.getByRole('button', { name: /tiktok/i }).or(page.getByRole('link', { name: /tiktok/i }));
await connect.first().click().catch(async () => {
  await page.goto(`${BASE}/auth/tiktok/start`);
});

console.log('[3] ⏸  MANUAL: log into TikTok + authorize in the window.');
console.log('    Script resumes automatically once back on', BASE);
await page.waitForURL(/tiktok\.com/, { timeout: 60000 }).catch(() => {});
await page.waitForURL(/workers\.dev\/accounts/, { timeout: 300000 });
await slow(3000);

console.log('[4] Accounts (connected) → composer walkthrough');
await page.goto(`${BASE}/accounts`, { waitUntil: 'networkidle' });
await slow(2500);
await page.goto(`${BASE}/posts/new`, { waitUntil: 'networkidle' });
await slow(2500);
await page.mouse.wheel(0, 400);
await slow(2000);
await page.goto(`${BASE}/posts/pipeline`, { waitUntil: 'networkidle' });
await slow(2500);
await page.goto(`${BASE}/posts/calendar`, { waitUntil: 'networkidle' });
await slow(2000);

const video = page.video();
await ctx.close();
await browser.close();
console.log('[5] Video saved:', await video.path());
