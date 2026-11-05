import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api, type AccountRow, type ChannelPost } from '../lib/api.js';
import { safeHref } from '../lib/safeHref.js';
import { Badge } from './ui/Badge.js';
import { Button } from './ui/Button.js';
import { EmptyState } from './ui/EmptyState.js';
import { Skeleton } from './ui/Skeleton.js';
import { useToast } from './ui/Toast.js';

function formatBigNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function PostTile({ post, platform }: { post: ChannelPost; platform: string }) {
  const href = post.url ? safeHref(post.url) : undefined;
  return (
    <a
      href={href ?? '#'}
      target={href ? '_blank' : undefined}
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-md border border-stone-200 bg-surface hover:border-brand-500 dark:border-stone-800 dark:bg-[#262019]"
    >
      <div className="relative aspect-video w-full bg-stone-100 dark:bg-stone-800">
        {post.thumbnail_url && safeHref(post.thumbnail_url) ? (
          <img
            src={safeHref(post.thumbnail_url)}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-3 text-center text-[11px] text-stone-400 dark:text-stone-500">
            <span className="line-clamp-4">{post.title || platform}</span>
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-2.5">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-ink group-hover:underline dark:text-stone-100">
          {post.title || '(untitled)'}
        </p>
        <p className="text-[11px] text-ink-muted dark:text-stone-400">
          {formatBigNumber(post.view_count)} views · {formatBigNumber(post.like_count)} likes ·{' '}
          {formatBigNumber(post.comment_count)} comments
        </p>
        {post.published_at != null && post.published_at > 0 && (
          <p className="text-[11px] text-ink-subtle dark:text-stone-500">
            {dayjs(post.published_at).format('MMM D, YYYY')}
          </p>
        )}
      </div>
    </a>
  );
}

/** Right-side drawer listing the posts already published on a connected
 *  account — FB feed posts, Threads, Reddit submissions, X tweets. Data
 *  comes from GET /accounts/:id/posts, which reads the synced copy in the
 *  DB — the Sync button calls POST .../posts/sync to refresh it. */
export function AccountLibraryDrawer({
  account,
  onClose,
}: {
  account: AccountRow;
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['channel-posts', account.id],
    queryFn: () => api.listChannelPosts(account.id),
    retry: 1,
  });
  const sync = useMutation({
    mutationFn: () => api.syncChannelPosts(account.id),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['channel-posts', account.id] });
      toast.push({ tone: 'success', title: `Synced ${d.synced} post${d.synced === 1 ? '' : 's'}` });
    },
    onError: (e) => {
      toast.push({
        tone: 'error',
        title: 'Sync failed',
        description:
          e instanceof Error && e.message.includes('token_refresh_failed')
            ? 'Access token expired — reconnect the account and try again.'
            : 'The platform API rejected the request.',
      });
    },
  });
  const posts = q.data?.posts ?? [];
  const syncedAt = q.data?.synced_at ?? null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/30 dark:bg-black/50" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label="Post library"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-stone-200 bg-surface shadow-float dark:border-stone-800 dark:bg-[#211d18]"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-800">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-ink dark:text-stone-100">Post library</h2>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-muted dark:text-stone-400">
              <span className="truncate">{account.display_name}</span>
              <Badge tone="neutral">{account.platform}</Badge>
            </p>
            {syncedAt != null && (
              <p className="mt-0.5 text-[11px] text-ink-subtle dark:text-stone-500">
                Synced {dayjs(syncedAt).format('MMM D, HH:mm')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => sync.mutate()}
              loading={sync.isPending}
            >
              Sync
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
              title="Couldn't load posts"
              description="Couldn't load the synced library. Try again."
              action={
                <Button size="sm" onClick={() => void q.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : posts.length === 0 ? (
            <EmptyState
              icon={<span>▶</span>}
              title={syncedAt == null ? 'Not synced yet' : 'No posts found'}
              description={
                syncedAt == null
                  ? 'Press Sync to pull the posts published on this account.'
                  : `Nothing published on this ${account.platform} account — or the connected token can't list posts yet.`
              }
              action={
                <Button size="sm" onClick={() => sync.mutate()} loading={sync.isPending}>
                  Sync now
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {posts.map((p) => (
                <PostTile key={p.id} post={p} platform={account.platform} />
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
