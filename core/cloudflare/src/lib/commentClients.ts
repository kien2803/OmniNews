/**
 * Per-platform comment read/reply clients. Only platforms with a usable
 * comment API are wired — reddit and x return [] / false rather than
 * pretending to work.
 */

export interface RemoteComment {
  external_comment_id: string;
  author_name: string;
  author_id: string;
  text: string;
  commented_at: number;
}

async function fbComments(postId: string, token: string): Promise<RemoteComment[]> {
  const u = new URL(`https://graph.facebook.com/v20.0/${postId}/comments`);
  u.searchParams.set('fields', 'id,message,from,created_time');
  u.searchParams.set('access_token', token);
  const res = await fetch(u);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: Array<{ id?: string; message?: string; from?: { name?: string; id?: string }; created_time?: string }>;
  };
  return (json.data ?? []).flatMap((c) =>
    c.id
      ? [
          {
            external_comment_id: c.id,
            author_name: c.from?.name ?? '',
            author_id: c.from?.id ?? '',
            text: c.message ?? '',
            commented_at: c.created_time ? Date.parse(c.created_time) : Date.now(),
          },
        ]
      : [],
  );
}

async function threadsReplies(mediaId: string, token: string): Promise<RemoteComment[]> {
  const u = new URL(`https://graph.threads.net/v1.0/${mediaId}/replies`);
  u.searchParams.set('fields', 'id,text,username,timestamp');
  u.searchParams.set('access_token', token);
  const res = await fetch(u);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: Array<{ id?: string; text?: string; username?: string; timestamp?: string }>;
  };
  return (json.data ?? []).flatMap((c) =>
    c.id
      ? [
          {
            external_comment_id: c.id,
            author_name: c.username ?? '',
            author_id: c.username ?? '',
            text: c.text ?? '',
            commented_at: c.timestamp ? Date.parse(c.timestamp) : Date.now(),
          },
        ]
      : [],
  );
}

export async function fetchComments(
  platform: string,
  externalPostId: string,
  accessToken: string,
): Promise<RemoteComment[]> {
  try {
    if (platform === 'facebook') return await fbComments(externalPostId, accessToken);
    if (platform === 'threads') return await threadsReplies(externalPostId, accessToken);
  } catch {
    /* network/parse failure → empty, next cron retries */
  }
  return [];
}

export async function replyComment(
  platform: string,
  externalCommentId: string,
  text: string,
  accessToken: string,
): Promise<boolean> {
  try {
    if (platform === 'facebook') {
      const res = await fetch(`https://graph.facebook.com/v20.0/${externalCommentId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, access_token: accessToken }),
      });
      return res.ok;
    }
    if (platform === 'threads') {
      const res = await fetch('https://graph.threads.net/v1.0/me/threads', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          media_type: 'TEXT',
          text,
          reply_to_id: externalCommentId,
          access_token: accessToken,
        }),
      });
      if (!res.ok) return false;
      const container = (await res.json()) as { id?: string };
      if (!container.id) return false;
      const pub = await fetch('https://graph.threads.net/v1.0/me/threads_publish', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ creation_id: container.id, access_token: accessToken }),
      });
      return pub.ok;
    }
  } catch {
    return false;
  }
  return false;
}
