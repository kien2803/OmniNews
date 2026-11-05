import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api, type AccountRow, type ChannelVideo } from '../lib/api.js';
import { safeHref } from '../lib/safeHref.js';
import { Badge } from './ui/Badge.js';
import { Button } from './ui/Button.js';
import { EmptyState } from './ui/EmptyState.js';
import { Skeleton } from './ui/Skeleton.js';

function formatBigNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function VideoTile({ video, platform }: { video: ChannelVideo; platform: string }) {
  const href = video.url ? safeHref(video.url) : undefined;
  const duration = formatDuration(video.duration_sec);
  return (
    <a
      href={href ?? '#'}
      target={href ? '_blank' : undefined}
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-md border border-stone-200 bg-surface hover:border-brand-500 dark:border-stone-800 dark:bg-[#262019]"
    >
      <div className="relative aspect-video w-full bg-stone-100 dark:bg-stone-800">
        {video.thumbnail_url && safeHref(video.thumbnail_url) ? (
          <img
            src={safeHref(video.thumbnail_url)}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-stone-400">
            <img src={`/icons/${platform}.svg`} alt="" className="h-8 w-8 opacity-60" />
          </div>
        )}
        {duration && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
            {duration}
          </span>
        )}
      </div>
      <div className="space-y-1.5 p-2.5">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-ink group-hover:underline dark:text-stone-100">
          {video.title || '(untitled)'}
        </p>
        <p className="text-[11px] text-ink-muted dark:text-stone-400">
          {formatBigNumber(video.view_count)} views · {formatBigNumber(video.like_count)} likes ·{' '}
          {formatBigNumber(video.comment_count)} comments
        </p>
        {video.published_at > 0 && (
          <p className="text-[11px] text-ink-subtle dark:text-stone-500">
            {dayjs(video.published_at).format('MMM D, YYYY')}
          </p>
        )}
      </div>
    </a>
  );
}

/** Right-side drawer listing the videos already published on a connected
 *  account — YouTube uploads+Shorts, TikTok videos, FB/IG Reels. Data comes
 *  from GET /accounts/:id/videos (platform APIs, live). */
export function AccountLibraryDrawer({
  account,
  onClose,
}: {
  account: AccountRow;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ['channel-videos', account.id],
    queryFn: () => api.listChannelVideos(account.id),
    retry: 1,
  });
  const videos = q.data?.videos ?? [];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/30 dark:bg-black/50" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label="Video library"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-stone-200 bg-surface shadow-float dark:border-stone-800 dark:bg-[#211d18]"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-800">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-ink dark:text-stone-100">Video library</h2>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-muted dark:text-stone-400">
              <img src={`/icons/${account.platform}.svg`} alt="" className="h-3.5 w-3.5" />
              <span className="truncate">{account.display_name}</span>
              <Badge tone="neutral">{account.platform}</Badge>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()} loading={q.isRefetching}>
              Refresh
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-ink-muted hover:text-ink dark:text-stone-400 dark:hover:text-stone-100"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {q.isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : q.isError ? (
            <EmptyState
              icon={<span>!</span>}
              title="Couldn't load videos"
              description={
                q.error instanceof Error && q.error.message.includes('token_refresh_failed')
                  ? 'Access token expired — reconnect the account and try again.'
                  : 'The platform API rejected the request. Try Refresh.'
              }
              action={
                <Button size="sm" onClick={() => void q.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : videos.length === 0 ? (
            <EmptyState
              icon={<span>▶</span>}
              title="No videos yet"
              description={`Nothing published on this ${account.platform} account — or the connected token can't list videos yet.`}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {videos.map((v) => (
                <VideoTile key={v.id} video={v} platform={account.platform} />
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
