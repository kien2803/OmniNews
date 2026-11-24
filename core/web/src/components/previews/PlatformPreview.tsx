import { PLATFORM_LABELS, type Platform } from '../../lib/api.js';
import {
  PLATFORM_LIMITS, resolvedImages, resolvedLink, resolvedText, resolvedTitle,
  textLength, type ArticleShape, type PostVariant,
} from '../../lib/variants.js';
import { IconFacebook, IconThreads, IconReddit, IconX } from '../icons.js';
import type { ComponentType, SVGProps } from 'react';

const ICON: Record<Platform, ComponentType<SVGProps<SVGSVGElement>>> = {
  facebook: IconFacebook, threads: IconThreads, reddit: IconReddit, x: IconX,
};

interface PreviewProps {
  platform: Platform;
  accountName: string;
  article: ArticleShape;
  variant: PostVariant | null;
  caption: string | null;
  /** Reddit only — subreddit/user target if known. */
  redditTarget?: string;
}

function CharCount({ platform, text, title }: { platform: Platform; text: string; title?: string }) {
  const lim = PLATFORM_LIMITS[platform];
  const len = textLength(platform, text);
  const over = len > lim.text;
  return (
    <div className="flex items-center justify-between border-t border-stone-200 px-3 py-1.5 font-mono text-[10px] dark:border-stone-700">
      <span className={over ? 'font-semibold text-red-600 dark:text-red-400' : 'text-ink-subtle dark:text-stone-500'}>
        {len}/{lim.text}{platform === 'x' ? ' weighted' : ''}
      </span>
      {title !== undefined && lim.title != null && (
        <span className={title.length > lim.title ? 'font-semibold text-red-600 dark:text-red-400' : 'text-ink-subtle dark:text-stone-500'}>
          title {title.length}/{lim.title}
        </span>
      )}
    </div>
  );
}

function MediaNote({ platform, images }: { platform: Platform; images: string[] }) {
  const lim = PLATFORM_LIMITS[platform];
  if (!images.length) return null;
  if (lim.maxImages === 0) {
    return (
      <p className="px-3 py-1 font-mono text-[10px] text-amber-700 dark:text-amber-400" role="note">
        ⚠ {images.length} image{images.length > 1 ? 's' : ''} not supported on {PLATFORM_LABELS[platform]} — dropped at publish
      </p>
    );
  }
  if (images.length > lim.maxImages) {
    return (
      <p className="px-3 py-1 font-mono text-[10px] text-amber-700 dark:text-amber-400" role="note">
        ⚠ {PLATFORM_LABELS[platform]} supports {lim.maxImages} image{lim.maxImages > 1 ? 's' : ''} — {images.length - lim.maxImages} dropped
      </p>
    );
  }
  return null;
}

function PreviewImage({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} className="max-h-40 w-full border-y border-stone-200 object-cover dark:border-stone-700" loading="lazy" />;
}

// ── Per-platform cards — intentionally stylized "editorial mock" cards,
// not pixel-copies of the real apps. Each shows exactly what will publish.

function FacebookCard({ accountName, text, link, images }: { accountName: string; text: string; link: string; images: string[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-3 pt-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1877f2]/10 text-[#1877f2]"><IconFacebook className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink dark:text-stone-100">{accountName}</p>
          <p className="font-mono text-[9px] uppercase text-ink-subtle dark:text-stone-500">Page · just now</p>
        </div>
      </div>
      {text && <p className="whitespace-pre-wrap px-3 pt-2 text-[13px] text-ink dark:text-stone-200">{text}</p>}
      {link && (
        <div className="mx-3 mt-2 border border-stone-200 dark:border-stone-700">
          <div className="bg-surface-muted px-2.5 py-2 dark:bg-stone-800/60">
            <p className="truncate font-mono text-[10px] uppercase text-ink-subtle dark:text-stone-500">{new URL(link).hostname}</p>
            <p className="truncate text-[12px] font-medium text-ink dark:text-stone-100">{link}</p>
          </div>
        </div>
      )}
      {images.slice(0, PLATFORM_LIMITS.facebook.maxImages).map((u) => <PreviewImage key={u} src={u} alt="" />)}
      <div className="flex justify-around border-t border-stone-200 px-3 py-2 font-mono text-[10px] text-ink-subtle dark:border-stone-700 dark:text-stone-500">
        <span>Like</span><span>Comment</span><span>Share</span>
      </div>
    </div>
  );
}

function ThreadsCard({ accountName, text, images }: { accountName: string; text: string; images: string[] }) {
  return (
    <div className="flex gap-2 px-3 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-surface dark:bg-stone-100 dark:text-ink"><IconThreads className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-ink dark:text-stone-100">{accountName}</p>
        {text && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink dark:text-stone-200">{text}</p>}
        {images[0] && <img src={images[0]} alt="" className="mt-2 max-h-36 w-full border border-stone-200 object-cover dark:border-stone-700" loading="lazy" />}
        <div className="mt-2 flex gap-4 font-mono text-[10px] text-ink-subtle dark:text-stone-500">
          <span>♡</span><span>↩</span><span>⟲</span><span>↗</span>
        </div>
      </div>
    </div>
  );
}

function RedditCard({ accountName, target, title, text, link, kind }: { accountName: string; target: string; title: string; text: string; link: string; kind: 'self' | 'link' }) {
  return (
    <div className="px-3 py-2.5">
      <p className="font-mono text-[10px] text-ink-subtle dark:text-stone-500">
        <span className="font-semibold text-ink dark:text-stone-200">{target}</span> · Posted by u/{accountName}
      </p>
      <p className="mt-1 text-[14px] font-medium leading-snug text-ink dark:text-stone-100">{title || '(no title)'}</p>
      {kind === 'link' ? (
        <p className="mt-1 flex items-center gap-1 truncate text-[12px] text-[#ff4500]"><span>↗</span><span className="truncate">{link}</span></p>
      ) : (
        text && <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[13px] text-ink-muted dark:text-stone-300">{text}</p>
      )}
      <div className="mt-2 flex gap-4 font-mono text-[10px] text-ink-subtle dark:text-stone-500">
        <span>⇧ ⇩</span><span>💬 Comments</span><span>Award</span><span>Share</span>
      </div>
    </div>
  );
}

function XCard({ accountName, text }: { accountName: string; text: string }) {
  return (
    <div className="flex gap-2 px-3 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-surface dark:bg-stone-100 dark:text-ink"><IconX className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-ink dark:text-stone-100">
          {accountName} <span className="font-normal text-ink-subtle dark:text-stone-500">· now</span>
        </p>
        {text && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink dark:text-stone-200">{text}</p>}
        <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-subtle dark:text-stone-500">
          <span>💬</span><span>⟲</span><span>♡</span><span>📊</span><span>↗</span>
        </div>
      </div>
    </div>
  );
}

/** Preview card for one destination — shows the exact resolved content
 *  (variant → caption → article fallback) as the platform will receive it. */
export function PlatformPreview({ platform, accountName, article, variant, caption, redditTarget }: PreviewProps) {
  const PIcon = ICON[platform];
  const text = resolvedText(article, variant, caption);
  const link = resolvedLink(article, variant);
  const images = resolvedImages(article, variant);
  const title = resolvedTitle(article, variant, text);
  const kind = variant?.reddit_kind ?? (link ? 'link' : 'self');
  // Threads/X append the link to text — mirror publish.ts exactly.
  const displayText = (platform === 'threads' || platform === 'x') && link && !text.includes(link)
    ? `${text}\n${link}`.trim() : text;

  return (
    <figure className="overflow-hidden rounded-sm border border-stone-300 bg-white dark:border-stone-700 dark:bg-[#1b1712]">
      <figcaption className="flex items-center justify-between border-b border-stone-200 bg-surface-muted px-3 py-1.5 dark:border-stone-700 dark:bg-stone-800/50">
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-stone-400">
          <PIcon className="h-3.5 w-3.5" /> {PLATFORM_LABELS[platform]} · preview
        </span>
        <span className="font-mono text-[9px] uppercase text-ink-subtle dark:text-stone-600">not the live post</span>
      </figcaption>
      {platform === 'facebook' && <FacebookCard accountName={accountName} text={displayText} link={link} images={images} />}
      {platform === 'threads' && <ThreadsCard accountName={accountName} text={displayText} images={images} />}
      {platform === 'reddit' && <RedditCard accountName={accountName} target={redditTarget || 'r/…'} title={title} text={displayText} link={link} kind={kind} />}
      {platform === 'x' && <XCard accountName={accountName} text={displayText} />}
      <MediaNote platform={platform} images={images} />
      <CharCount platform={platform} text={displayText} title={platform === 'reddit' ? title : undefined} />
    </figure>
  );
}
