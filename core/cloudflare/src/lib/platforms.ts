import type { Platform } from '../repos/types';

/** Per-platform publish constraints — single source of truth for both
 *  schedule-time validation and publish-time truncation. */
export const PLATFORM_LIMITS: Record<Platform, { text: number; title: number | null; maxImages: number }> = {
  facebook: { text: 63_206, title: null, maxImages: 10 },
  threads: { text: 500, title: null, maxImages: 1 },
  reddit: { text: 40_000, title: 300, maxImages: 0 },
  x: { text: 280, title: null, maxImages: 0 },
};

/** Truncate text to the platform's cap with an ellipsis — keeps the post
 *  publishable instead of failing on length. */
export function fitText(platform: Platform, text: string): string {
  const max = PLATFORM_LIMITS[platform].text;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function fitTitle(platform: Platform, title: string): string {
  const max = PLATFORM_LIMITS[platform].title;
  if (max == null || title.length <= max) return title;
  return title.slice(0, max);
}
