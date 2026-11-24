import { describe, expect, it } from 'vitest';
import {
  isHttpUrl, resolvedImages, resolvedLink, resolvedText, resolvedTitle,
  validatePost, xWeightedLength,
} from './variants';

const article = {
  title: 'Launch notes',
  body: 'We shipped the thing.',
  link_url: 'https://example.com/launch',
  images: '["https://cdn.example.com/a.jpg"]',
};
const noArticle = { title: '', body: '', link_url: null as string | null, images: '[]' };

describe('xWeightedLength', () => {
  it('counts ASCII as 1', () => {
    expect(xWeightedLength('hello world')).toBe(11);
  });
  it('counts URLs as 23 regardless of length', () => {
    expect(xWeightedLength('check https://example.com/a-very-long-path ok')).toBe(6 + 23 + 3);
  });
  it('counts CJK codepoints as 2', () => {
    expect(xWeightedLength('\u4e2d\u6587')).toBe(4);
  });
  it('counts emoji as 2', () => {
    expect(xWeightedLength('hi 🎉')).toBe(5);
  });
  it('mixed text + url stays under/over 280 correctly', () => {
    const t = 'a'.repeat(270);
    expect(xWeightedLength(t)).toBe(270);
    expect(xWeightedLength(`${t} https://x.co`)).toBe(270 + 1 + 23);
  });
});

describe('resolvers', () => {
  it('variant.text wins, then caption, then article', () => {
    expect(resolvedText('x', article, { text: 'v' }, 'cap')).toBe('v');
    expect(resolvedText('x', article, null, 'cap')).toBe('cap');
    expect(resolvedText('x', article, null, null)).toBe('Launch notes\n\nWe shipped the thing.');
  });
  it('variant link/images override article', () => {
    expect(resolvedLink(article, { link_url: 'https://v.com' })).toBe('https://v.com');
    expect(resolvedLink(article, null)).toBe('https://example.com/launch');
    expect(resolvedImages(article, { images: [] })).toEqual([]);
    expect(resolvedImages(article, null)).toEqual(['https://cdn.example.com/a.jpg']);
  });
  it('resolvedTitle falls back to first text line', () => {
    expect(resolvedTitle(article, null, 'first\nsecond')).toBe('Launch notes');
    expect(resolvedTitle(noArticle, { title: 'V' }, 'x')).toBe('V');
    expect(resolvedTitle(noArticle, null, 'first\nsecond')).toBe('first');
  });
});

describe('isHttpUrl', () => {
  it('accepts http(s) only', () => {
    expect(isHttpUrl('https://a.com')).toBe(true);
    expect(isHttpUrl('http://a.com')).toBe(true);
    expect(isHttpUrl('ftp://a.com')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('a.com')).toBe(false);
  });
});

describe('validatePost', () => {
  it('empty everything → empty_post', () => {
    const r = validatePost('x', noArticle, null, null);
    expect(r.errors.map((e) => e.code)).toContain('empty_post');
  });
  it('x: weighted text over 280 → text_too_long', () => {
    const long = 'a'.repeat(270);
    expect(validatePost('x', { ...noArticle, body: long }, null, null).errors).toHaveLength(0);
    const over = `${long} https://x.co/long`;
    const r = validatePost('x', { ...noArticle, body: over }, null, null);
    expect(r.errors[0].code).toBe('text_too_long');
    expect(r.errors[0].actual).toBeGreaterThan(280);
  });
  it('threads: >500 → text_too_long', () => {
    const r = validatePost('threads', { ...noArticle, body: 'x'.repeat(501) }, null, null);
    expect(r.errors[0].code).toBe('text_too_long');
  });
  it('reddit: missing title → error; variant title fixes it', () => {
    const r = validatePost('reddit', { ...noArticle, body: 'body only' }, null, null);
    expect(r.errors.map((e) => e.code)).not.toContain('missing_title'); // first line fallback
    const v = validatePost('reddit', { ...noArticle, body: '' }, null, null);
    expect(v.errors.map((e) => e.code)).toContain('missing_title');
    const ok = validatePost('reddit', { ...noArticle, body: '' }, { title: 'T', link_url: 'https://l.com' }, null);
    expect(ok.errors.map((e) => e.code)).not.toContain('missing_title');
  });
  it('reddit: link kind without url → link_required', () => {
    const r = validatePost('reddit', noArticle, { text: 't', reddit_kind: 'link' }, null);
    expect(r.errors.map((e) => e.code)).toContain('link_required');
  });
  it('invalid link url → invalid_url', () => {
    const r = validatePost('facebook', { ...article, link_url: 'notaurl' }, null, null);
    expect(r.errors.map((e) => e.code)).toContain('invalid_url');
  });
  it('images on x → warning, not error', () => {
    const r = validatePost('x', article, null, null);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings.map((w) => w.code)).toContain('media_unsupported');
  });
  it('facebook valid post → no errors', () => {
    expect(validatePost('facebook', article, null, null).errors).toHaveLength(0);
  });
});
