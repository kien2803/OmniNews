import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api, type ArticleInput, type ArticleWire } from '../lib/api.js';
import { useToast } from '../components/ui/Toast.js';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { Modal } from '../components/ui/Modal.js';
import { Field, TextArea } from '../components/ui/Field.js';

function excerpt(body: string, n = 160): string {
  const t = body.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function ArticleForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: ArticleWire;
  pending: boolean;
  onSubmit: (input: ArticleInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [link, setLink] = useState(initial?.link_url ?? '');
  const [images, setImages] = useState((initial?.images ?? []).join('\n'));
  const canSubmit = !!(title.trim() || body.trim() || link.trim() || images.trim());
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          title: title.trim(),
          body: body.trim(),
          link_url: link.trim(),
          images: images.split('\n').map((u) => u.trim()).filter(Boolean),
        });
      }}
    >
      <Field label="Title" hint={`${title.length}/300`}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Post title (used by Reddit)" className="input" />
      </Field>
      <Field label="Body" hint={`${body.length}/20000`}>
        <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={20000} placeholder="Write your post…" />
      </Field>
      <Field label="Link URL (optional)">
        <input value={link} onChange={(e) => setLink(e.target.value)} type="url" placeholder="https://…" className="input" />
      </Field>
      <Field label="Image URLs — one per line (optional)" hint="Public http(s) URLs the platforms can fetch">
        <TextArea value={images} onChange={(e) => setImages(e.target.value)} rows={3} placeholder="https://example.com/photo.jpg" />
      </Field>
      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={pending} disabled={!canSubmit}>{initial ? 'Save changes' : 'Create article'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function LibraryPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [gridView, setGridView] = useState(true);
  const [preview, setPreview] = useState<ArticleWire | null>(null);
  const [editing, setEditing] = useState<ArticleWire | 'new' | null>(null);

  const articles = useQuery({ queryKey: ['articles'], queryFn: () => api.listArticles() });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['articles'] });
  const save = useMutation({
    mutationFn: (input: ArticleInput & { id?: string }) =>
      input.id ? api.updateArticle(input.id, input) : api.createArticle(input),
    onSuccess: (_r, v) => {
      toast.push({ tone: 'success', title: v.id ? 'Article saved' : 'Article created' });
      setEditing(null);
      invalidate();
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Save failed', description: e instanceof Error ? e.message : 'unknown_error' }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteArticle(id),
    onSuccess: () => { toast.push({ tone: 'success', title: 'Article deleted' }); setPreview(null); invalidate(); },
    onError: (e) => toast.push({ tone: 'error', title: 'Delete failed', description: e instanceof Error ? e.message : 'unknown_error' }),
  });

  const items = useMemo(() => {
    const all = articles.data?.articles ?? [];
    if (!q.trim()) return all;
    const needle = q.trim().toLowerCase();
    return all.filter((a) => a.title.toLowerCase().includes(needle) || a.body.toLowerCase().includes(needle));
  }, [articles.data, q]);

  const badges = (a: ArticleWire) => (
    <p className="font-mono text-[10px] text-ink-subtle dark:text-stone-500">
      {a.images.length > 0 && <span>{a.images.length} img · </span>}
      {a.link_url && <span>link · </span>}
      {dayjs(a.created_at).format('MMM D')}
    </p>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] text-ink-subtle dark:text-stone-500">content</p>
          <h1 className="font-display text-2xl font-semibold text-ink dark:text-stone-100">Article Library</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search articles…"
            aria-label="Search articles"
            className="w-48 rounded-sm border border-stone-300 bg-surface px-3 py-1.5 text-sm placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-[#211d18] dark:text-stone-100 dark:placeholder:text-stone-500"
          />
          <div className="flex rounded-sm border border-stone-300 dark:border-stone-700" role="group" aria-label="View">
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setGridView(v === 'grid')}
                className={`px-2.5 py-1.5 text-xs font-medium capitalize ${((v === 'grid') === gridView) ? 'bg-brand-600 text-white' : 'text-ink-muted dark:text-stone-400'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setEditing('new')}>New article</Button>
        </div>
      </header>

      {articles.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : articles.isError ? (
        <EmptyState title="Couldn't load articles" description={articles.error instanceof Error ? articles.error.message : 'unknown_error'} action={<Button size="sm" onClick={() => void articles.refetch()}>Retry</Button>} />
      ) : items.length === 0 ? (
        <EmptyState
          title={q ? 'No articles match' : 'No articles yet'}
          description={q ? 'Try a different search term.' : 'Write your first article to start publishing.'}
          action={!q ? <Button size="sm" onClick={() => setEditing('new')}>New article</Button> : undefined}
        />
      ) : gridView ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => (
            <article key={a.id} className="group border border-stone-200 bg-surface dark:border-stone-800 dark:bg-[#211d18]">
              <button type="button" onClick={() => setPreview(a)} className="block w-full overflow-hidden bg-stone-100 text-left dark:bg-stone-800/60">
                {a.images[0] ? (
                  <img src={a.images[0]} alt="" className="aspect-video w-full object-cover" />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center p-3 font-mono text-[10px] text-ink-subtle dark:text-stone-500">
                    {excerpt(a.body, 60) || 'ARTICLE'}
                  </div>
                )}
              </button>
              <div className="space-y-1 p-2.5">
                <p className="truncate text-[13px] font-medium text-ink dark:text-stone-100" title={a.title || a.body}>
                  {a.title || excerpt(a.body, 40) || '(untitled)'}
                </p>
                {badges(a)}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/posts/new?article=${a.id}`)}>Create Post</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Edit</Button>
                  <Button size="sm" variant="ghost" loading={del.isPending} onClick={() => { if (window.confirm('Delete this article?')) del.mutate(a.id); }}>Delete</Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="border border-stone-200 dark:border-stone-800">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-b border-stone-200 px-3 py-2 last:border-b-0 hover:bg-surface-muted/50 dark:border-stone-800 dark:hover:bg-stone-800/40">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink dark:text-stone-100">{a.title || excerpt(a.body, 60) || '(untitled)'}</p>
                {badges(a)}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => navigate(`/posts/new?article=${a.id}`)}>Create Post</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Edit</Button>
                <Button size="sm" variant="ghost" loading={del.isPending} onClick={() => { if (window.confirm('Delete this article?')) del.mutate(a.id); }}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <Modal open onClose={() => setPreview(null)} title={preview.title || 'Article preview'} size="lg">
          <dl className="space-y-2 text-sm">
            {preview.images[0] && <img src={preview.images[0]} alt="" className="w-full rounded-sm object-cover" />}
            {preview.body && <dd className="whitespace-pre-wrap rounded-sm bg-surface-muted p-2 text-[13px] text-ink dark:bg-stone-800/50 dark:text-stone-200">{preview.body}</dd>}
            {preview.link_url && <div className="flex justify-between"><dt className="text-ink-subtle dark:text-stone-500">Link</dt><dd className="truncate font-mono">{preview.link_url}</dd></div>}
            <div className="flex justify-between"><dt className="text-ink-subtle dark:text-stone-500">Images</dt><dd className="font-mono">{preview.images.length}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-subtle dark:text-stone-500">Created</dt><dd>{dayjs(preview.created_at).format('MMM D, YYYY HH:mm')}</dd></div>
            <div className="flex gap-2 pt-1">
              <Button onClick={() => { setPreview(null); navigate(`/posts/new?article=${preview.id}`); }}>Create Post with this article</Button>
              <Button variant="ghost" loading={del.isPending} onClick={() => { if (window.confirm('Delete this article?')) del.mutate(preview.id); }}>Delete</Button>
            </div>
          </dl>
        </Modal>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing === 'new' ? 'New article' : 'Edit article'} size="lg">
          <ArticleForm
            initial={editing === 'new' ? undefined : editing}
            pending={save.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(input) => save.mutate(editing === 'new' ? input : { ...input, id: editing.id })}
          />
        </Modal>
      )}
    </div>
  );
}
