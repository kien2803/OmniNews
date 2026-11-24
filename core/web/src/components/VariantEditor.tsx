import type { AccountInfo } from '../lib/accounts.js';
import { PLATFORM_LABELS, type Platform } from '../lib/api.js';
import {
  PLATFORM_LIMITS, resolvedImages, resolvedLink, resolvedText, resolvedTitle,
  textLength, validatePost, type ArticleShape, type PostVariant,
} from '../lib/variants.js';
import { PlatformPreview } from './previews/PlatformPreview.js';
import { Button } from './ui/Button.js';
import { Field, TextArea } from './ui/Field.js';
import { IconFacebook, IconThreads, IconReddit, IconX } from './icons.js';
import type { ComponentType, SVGProps } from 'react';

const ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  facebook: IconFacebook, threads: IconThreads, reddit: IconReddit, x: IconX,
};

interface VariantEditorProps {
  account: AccountInfo;
  article: ArticleShape;
  /** Shared caption fallback from section above. */
  caption: string;
  variant: PostVariant | undefined;
  onChange: (accountId: string, patch: PostVariant) => void;
  onReset: (accountId: string) => void;
}

function IssueList({ issues, tone }: { issues: Array<{ code: string; message: string }>; tone: 'error' | 'warn' }) {
  if (!issues.length) return null;
  const cls = tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400';
  return (
    <ul className={`space-y-0.5 text-[11px] ${cls}`} role={tone === 'error' ? 'alert' : 'note'}>
      {issues.map((i) => <li key={i.code}>• {i.message}</li>)}
    </ul>
  );
}

/** Per-account adaptation card — edits a sparse PostVariant (unset fields
 *  inherit story/caption resolution) and previews the resolved result. */
export function VariantEditor({ account, article, caption, variant, onChange, onReset }: VariantEditorProps) {
  const platform = account.platform as Platform;
  const lim = PLATFORM_LIMITS[platform] ?? PLATFORM_LIMITS.facebook;
  const Icon = ICON[platform] ?? IconFacebook;

  const patch = (p: PostVariant) => onChange(account.id, p);
  const text = resolvedText(article, variant, caption);
  const link = resolvedLink(article, variant);
  const images = resolvedImages(article, variant);
  const title = resolvedTitle(article, variant, text);
  const kind = variant?.reddit_kind ?? (link ? 'link' : 'self');
  const len = textLength(platform, text);
  const v = validatePost(platform, article, variant, caption);
  const edited = !!variant && Object.keys(variant).length > 0;
  const mediaSupported = lim.maxImages > 0;

  return (
    <div className="border border-stone-200 bg-surface dark:border-stone-700 dark:bg-[#211d18]">
      <header className="flex items-center gap-2 border-b border-stone-200 px-3 py-2 dark:border-stone-700">
        <Icon className="h-4 w-4 text-ink-muted dark:text-stone-400" />
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink dark:text-stone-100">
          {account.display_name}
          <span className="ml-1.5 font-mono text-[10px] font-normal uppercase text-ink-subtle dark:text-stone-500">{PLATFORM_LABELS[platform]}</span>
        </p>
        {edited && (
          <Button size="sm" variant="ghost" onClick={() => onReset(account.id)} title="Clear overrides — re-inherit from the story">
            Reset to story
          </Button>
        )}
      </header>

      <div className="grid gap-4 p-3 lg:grid-cols-2">
        <div className="space-y-3">
          {platform === 'reddit' && (
            <>
              <Field label="Post title" hint={`${title.length}/300 — required by Reddit`} required>
                <input
                  className="input"
                  value={variant?.title ?? article.title ?? ''}
                  maxLength={300}
                  onChange={(e) => patch({ title: e.target.value })}
                />
              </Field>
              <Field label="Post kind">
                <div className="flex gap-2" role="radiogroup" aria-label="Reddit post kind">
                  {(['self', 'link'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={kind === k}
                      onClick={() => patch({ reddit_kind: k })}
                      className={`rounded-sm border px-2.5 py-1 text-xs font-medium ${
                        kind === k
                          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-100'
                          : 'border-stone-200 text-ink-muted hover:border-stone-400 dark:border-stone-700 dark:text-stone-400'
                      }`}
                    >
                      {k === 'self' ? 'Text post' : 'Link post'}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {kind !== 'link' && (
            <Field
              label="Copy"
              hint={
                <span className={len > lim.text ? 'font-semibold text-red-600 dark:text-red-400' : undefined}>
                  {len}/{lim.text}{platform === 'x' ? ' weighted' : ''}
                  {!variant?.text && caption ? ' — shared deck' : !variant?.text ? ' — from story' : ''}
                </span>
              }
            >
              <TextArea
                value={variant?.text ?? text}
                rows={platform === 'x' || platform === 'threads' ? 4 : 6}
                onChange={(e) => patch({ text: e.target.value })}
              />
            </Field>
          )}

          <Field label={platform === 'reddit' && kind === 'link' ? 'Link URL' : 'Link URL (optional)'}>
            <input
              className="input"
              type="url"
              value={variant?.link_url ?? link}
              placeholder="https://…"
              onChange={(e) => patch({ link_url: e.target.value })}
            />
          </Field>

          {mediaSupported && (
            <Field label={`Image URLs — one per line (max ${lim.maxImages})`}>
              <TextArea
                value={(variant?.images ?? images).join('\n')}
                rows={2}
                placeholder="https://example.com/photo.jpg"
                onChange={(e) => patch({ images: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
              />
            </Field>
          )}
          {!mediaSupported && images.length > 0 && (
            <p className="font-mono text-[10px] text-amber-700 dark:text-amber-400">
              ⚠ story has {images.length} image{images.length > 1 ? 's' : ''} — {PLATFORM_LABELS[platform]} doesn't support attached media
            </p>
          )}

          <IssueList issues={v.errors} tone="error" />
          <IssueList issues={v.warnings} tone="warn" />
        </div>

        <div className="space-y-2">
          <PlatformPreview
            platform={platform}
            accountName={account.display_name}
            article={article}
            variant={variant ?? null}
            caption={caption}
            redditTarget={account.target ? (account.target.startsWith('r/') || account.target.startsWith('u/') ? account.target : `r/${account.target}`) : undefined}
          />
        </div>
      </div>
    </div>
  );
}
