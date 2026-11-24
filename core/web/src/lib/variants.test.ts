import { describe, expect, it } from 'vitest';
import {
  resolvedText, textLength, validatePost, xWeightedLength,
} from './variants.js';

const article = {
  title: 'Launch notes',
  body: 'We shipped the thing.',
  link_url: 'https://example.com/launch',
  images: ['https://cdn.example.com/a.jpg'],
};

describe('xWeightedLength', () => {
  it('counts ASCII as 1, URLs as 23, emoji as 2', () => {
    expect(xWeightedLength('hello')).toBe(5);
    expect(xWeightedLength('see https://example.com/long/path')).toBe(4 + 23);
    expect(xWeightedLength('hi 🎉')).toBe(5);
  });
  it('textLength uses weighted only for x', () => {
    const t = 'a'.repeat(270);
    expect(textLength('x', t)).toBe(270);
    expect(textLength('x', `${t} https://x.co`)).toBe(294);
    expect(textLength('threads', 'a🎉b')).toBe(3); // codepoints, not weighted
  });
});

describe('resolvedText / variants', () => {
  it('variant > caption > article', () => {
    expect(resolvedText(article, { text: 'v' }, 'cap')).toBe('v');
    expect(resolvedText(article, null, 'cap')).toBe('cap');
    expect(resolvedText(article, null, null)).toBe('Launch notes\n\nWe shipped the thing.');
  });
  it('accepts images as JSON string or array', () => {
    const r1 = validatePost('facebook', { ...article, images: '["https://a.com/1.jpg"]' }, null, null);
    expect(r1.errors).toHaveLength(0);
  });
});

describe('validatePost', () => {
  it('x over-limit via weighted counting → text_too_long', () => {
    const r = validatePost('x', { ...article, body: `${'a'.repeat(270)} https://x.co` }, null, null);
    expect(r.errors[0]?.code).toBe('text_too_long');
  });
  it('threads 500 cap', () => {
    const r = validatePost('threads', { ...article, body: 'x'.repeat(501) }, null, null);
    expect(r.errors[0]?.code).toBe('text_too_long');
  });
  it('reddit link kind without url → link_required', () => {
    const r = validatePost('reddit', article, { reddit_kind: 'link', link_url: '' }, null);
    expect(r.errors.map((e) => e.code)).toContain('link_required');
  });
  it('images on x → warning not error', () => {
    const r = validatePost('x', article, null, null);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings.map((w) => w.code)).toContain('media_unsupported');
  });
});
