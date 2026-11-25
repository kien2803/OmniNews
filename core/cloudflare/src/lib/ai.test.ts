import { describe, expect, it } from 'vitest';
import { buildOfflineVariant, generateVariant, parseAiJson, type GenerateInput } from './ai';
import { xWeightedLength } from './variants';
import type { Env } from '../env';

const article = {
  title: 'We shipped the exporter',
  body: 'After six weeks of work, the team shipped a new CSV exporter. It handles 100k rows in under two seconds, a 4x improvement over the old pipeline.',
  link_url: 'https://example.com/changelog',
  images: [],
};
const input = (platform: GenerateInput['platform']): GenerateInput => ({ platform, article });
const env = (over: Partial<Env> = {}) => ({ ...over }) as Env;

describe('parseAiJson', () => {
  it('parses plain json, fenced json, and prose-wrapped json', () => {
    expect(parseAiJson('{"text":"hi"}')?.text).toBe('hi');
    expect(parseAiJson('```json\n{"text":"hi","title":"t"}\n```')?.title).toBe('t');
    expect(parseAiJson('Here you go: {"text":"x"} hope it helps')?.text).toBe('x');
  });
  it('rejects malformed / non-text payloads', () => {
    expect(parseAiJson('no json here')).toBeNull();
    expect(parseAiJson('{"text":42}')).toBeNull();
    expect(parseAiJson('[]')).toBeNull();
  });
});

describe('buildOfflineVariant', () => {
  it('x: stays inside weighted budget and never invents text', () => {
    const v = buildOfflineVariant(input('x'));
    expect(xWeightedLength(v.text!)).toBeLessThanOrEqual(280);
    expect(v.text).toContain('exporter');
  });
  it('threads: single paragraph, ≤500', () => {
    const v = buildOfflineVariant(input('threads'));
    expect(v.text!.length).toBeLessThanOrEqual(500);
    expect(v.text).not.toContain('\n\n');
  });
  it('reddit: title + kind from link presence', () => {
    const v = buildOfflineVariant(input('reddit'));
    expect(v.title).toBe('We shipped the exporter');
    expect(v.reddit_kind).toBe('link');
    const self = buildOfflineVariant({ platform: 'reddit', article: { ...article, link_url: '' } });
    expect(self.reddit_kind).toBe('self');
  });
  it('facebook: keeps full article', () => {
    const v = buildOfflineVariant(input('facebook'));
    expect(v.text).toContain('4x improvement');
  });
});

describe('generateVariant', () => {
  it('no provider key → offline source, still produces a variant', async () => {
    const r = await generateVariant(env(), input('x'));
    expect(r.source).toBe('offline');
    expect(r.variant.text).toBeTruthy();
  });
  it('provider configured but unreachable → graceful offline fallback', async () => {
    // AI_API_KEY set, provider anthropic — fetch to real endpoint will fail
    // in test (no network or 401) and must fall back, not throw.
    const r = await generateVariant(
      env({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'sk-test', AI_BASE_URL: 'http://127.0.0.1:1' }),
      input('threads'),
    );
    expect(r.variant.text).toBeTruthy();
    expect(['ai', 'offline']).toContain(r.source);
  }, 30_000);
});
