import { describe, it, expect } from 'vitest';
import { PLATFORM_LIMITS, fitText, fitTitle } from './platforms';

describe('PLATFORM_LIMITS', () => {
  it('covers every publishable platform', () => {
    for (const p of ['facebook', 'threads', 'reddit', 'x'] as const) {
      expect(PLATFORM_LIMITS[p].text).toBeGreaterThan(0);
    }
  });

  it('matches documented caps', () => {
    expect(PLATFORM_LIMITS.x.text).toBe(280);
    expect(PLATFORM_LIMITS.threads.text).toBe(500);
    expect(PLATFORM_LIMITS.reddit.title).toBe(300);
    expect(PLATFORM_LIMITS.reddit.text).toBe(40_000);
  });
});

describe('fitText', () => {
  it('returns short text unchanged', () => {
    expect(fitText('x', 'hello')).toBe('hello');
  });

  it('truncates X posts to 280 chars with ellipsis', () => {
    const out = fitText('x', 'a'.repeat(400));
    expect(out.length).toBe(280);
    expect(out.endsWith('…')).toBe(true);
  });

  it('truncates Threads posts to 500 chars', () => {
    const out = fitText('threads', 'a'.repeat(700));
    expect(out.length).toBe(500);
    expect(out.endsWith('…')).toBe(true);
  });

  it('leaves Reddit-length text alone', () => {
    const text = 'b'.repeat(1000);
    expect(fitText('reddit', text)).toBe(text);
  });
});

describe('fitTitle', () => {
  it('truncates Reddit titles at 300 chars (hard platform cap)', () => {
    const out = fitTitle('reddit', 't'.repeat(400));
    expect(out.length).toBe(300);
    expect(out.endsWith('…')).toBe(false); // title cap is a hard slice
  });

  it('does not touch platforms without a title field', () => {
    const title = 'x'.repeat(500);
    expect(fitTitle('x', title)).toBe(title);
    expect(fitTitle('threads', title)).toBe(title);
    expect(fitTitle('facebook', title)).toBe(title);
  });
});
