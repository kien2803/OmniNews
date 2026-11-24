/** Mirrors core/cloudflare/src/lib/variants.ts + platforms.ts — the SPA
 *  can't import the worker package, so the contract is duplicated here
 *  (same convention as PLATFORM_TEXT_LIMITS). Keep in sync. */
import type { Platform } from './api.js';

export interface PostVariant {
  text?: string;
  title?: string;
  link_url?: string;
  images?: string[];
  reddit_kind?: 'self' | 'link';
}

export interface ValidationIssue {
  code: string;
  field: 'text' | 'title' | 'link_url' | 'images' | 'account' | 'schedule';
  message: string;
  limit?: number;
  actual?: number;
}

export interface PostValidation {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export const PLATFORM_LIMITS: Record<Platform, { text: number; title: number | null; maxImages: number }> = {
  facebook: { text: 63_206, title: null, maxImages: 10 },
  threads: { text: 500, title: null, maxImages: 1 },
  reddit: { text: 40_000, title: 300, maxImages: 0 },
  x: { text: 280, title: null, maxImages: 0 },
};

const HTTP_URL = /^https?:\/\/\S+$/i;
export const isHttpUrl = (u: string): boolean => HTTP_URL.test(u);

const X_URL_WEIGHT = 23;
const HEAVY_RANGES: Array<[number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0x9fff],
  [0xa000, 0xa4ff],
  [0xac00, 0xd7ff],
  [0xf900, 0xfaff],
  [0x1f000, 0x1faff],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];
const URL_RE = /https?:\/\/\S+/gi;

export function xWeightedLength(text: string): number {
  let total = 0;
  const stripped = text.replace(URL_RE, () => {
    total += X_URL_WEIGHT;
    return '';
  });
  for (const ch of stripped) {
    const cp = ch.codePointAt(0)!;
    total += HEAVY_RANGES.some(([a, b]) => cp >= a && cp <= b) ? 2 : 1;
  }
  return total;
}

/** Display length for the counter UI — weighted on X, codepoints elsewhere. */
export function textLength(platform: Platform, text: string): number {
  return platform === 'x' ? xWeightedLength(text) : [...text].length;
}

export interface ArticleShape {
  title?: string | null;
  body?: string | null;
  link_url?: string | null;
  images?: string[] | string;
}

export function resolvedText(
  article: ArticleShape,
  variant: PostVariant | null | undefined,
  caption: string | null | undefined,
): string {
  const v = variant?.text ?? caption;
  if (v?.trim()) return v.trim();
  const parts = [article.title, article.body].filter((s) => s?.trim());
  return parts.join('\n\n').trim();
}

export function resolvedLink(article: ArticleShape, variant?: PostVariant | null): string {
  return variant?.link_url ?? article.link_url ?? '';
}

export function resolvedImages(article: ArticleShape, variant?: PostVariant | null): string[] {
  if (variant?.images !== undefined) return variant.images.filter((u) => isHttpUrl(u));
  const raw = article.images;
  if (Array.isArray(raw)) return raw.filter((u) => isHttpUrl(u));
  try {
    const arr = JSON.parse(raw || '[]') as unknown;
    return Array.isArray(arr) ? arr.filter((u): u is string => typeof u === 'string' && u.startsWith('http')) : [];
  } catch {
    return [];
  }
}

export function resolvedTitle(article: ArticleShape, variant: PostVariant | null | undefined, text: string): string {
  const t = variant?.title ?? article.title ?? '';
  return (t.trim() || text.split('\n')[0] || '').trim();
}

export function validatePost(
  platform: Platform,
  article: ArticleShape,
  variant: PostVariant | null | undefined,
  caption: string | null | undefined,
): PostValidation {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const lim = PLATFORM_LIMITS[platform];

  const text = resolvedText(article, variant, caption);
  const link = resolvedLink(article, variant);
  const images = resolvedImages(article, variant);
  const kind = variant?.reddit_kind ?? (link ? 'link' : 'self');

  if (!text.trim() && !(platform === 'reddit' && kind === 'link') && !link) {
    errors.push({ code: 'empty_post', field: 'text', message: 'Post has no text, title or link' });
  }

  const len = textLength(platform, text);
  if (len > lim.text) {
    errors.push({
      code: 'text_too_long', field: 'text', limit: lim.text, actual: len,
      message: `${platform} allows ${lim.text} ${platform === 'x' ? 'weighted ' : ''}characters (currently ${len})`,
    });
  }

  if (link && !isHttpUrl(link)) {
    errors.push({ code: 'invalid_url', field: 'link_url', message: 'Link must start with http:// or https://' });
  }
  for (const u of images) {
    if (!isHttpUrl(u)) {
      errors.push({ code: 'invalid_image_url', field: 'images', message: `Image URL is invalid: ${u.slice(0, 60)}` });
      break;
    }
  }

  if (images.length > lim.maxImages) {
    if (lim.maxImages === 0) {
      warnings.push({ code: 'media_unsupported', field: 'images', message: `${platform} doesn't support attached images — they will be dropped` });
    } else {
      warnings.push({ code: 'too_many_images', field: 'images', message: `${platform} supports ${lim.maxImages} image(s); extra images will be dropped` });
    }
  }

  if (platform === 'reddit') {
    const title = resolvedTitle(article, variant, text);
    if (!title) {
      errors.push({ code: 'missing_title', field: 'title', message: 'Reddit requires a title' });
    } else if (title.length > (lim.title ?? 300)) {
      errors.push({ code: 'title_too_long', field: 'title', limit: lim.title ?? 300, actual: title.length, message: `Reddit titles are limited to ${lim.title} characters (currently ${title.length})` });
    }
    if (kind === 'link' && !link) {
      errors.push({ code: 'link_required', field: 'link_url', message: 'Link posts require a URL' });
    }
    if (kind === 'link' && text) {
      warnings.push({ code: 'link_kind_ignores_text', field: 'text', message: 'Reddit link posts show the URL, not the body text' });
    }
  }

  return { errors, warnings };
}
