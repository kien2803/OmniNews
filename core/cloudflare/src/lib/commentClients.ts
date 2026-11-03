/**
 * Per-platform comment read/reply clients. TikTok has no public comment
 * API for standard apps — fetchComments returns [] and replyComment fails
 * visibly rather than pretending to work.
 */

export interface RemoteComment {
  external_comment_id: string;
  author_name: string;
  author_id: string;
  text: string;
  commented_at: number;
}

async function ytComments(videoId: string, token: string): Promise<RemoteComment[]> {
  const u = new URL('https://youtube.googleapis.com/youtube/v3/commentThreads');
  u.searchParams.set('part', 'snippet');
  u.searchParams.set('videoId', videoId);
  u.searchParams.set('order', 'time');
  u.searchParams.set('maxResults', '50');
  u.searchParams.set('textFormat', 'plainText');
  const res = await fetch(u, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    items?: Array<{
      snippet?: {
        topLevelComment?: {
          id?: string;
          snippet?: {
            authorDisplayName?: string;
            authorChannelId?: { value?: string };
            textDisplay?: string;
            publishedAt?: string;
          };
        };
      };
    }>;
  };
  return (json.items ?? []).flatMap((it) => {
    const c = it.snippet?.topLevelComment;
    if (!c?.id) return [];
    return [
      {
        external_comment_id: c.id,
        author_name: c.snippet?.authorDisplayName ?? '',
        author_id: c.snippet?.authorChannelId?.value ?? '',
        text: c.snippet?.textDisplay ?? '',
        commented_at: c.snippet?.publishedAt ? Date.parse(c.snippet.publishedAt) : Date.now(),
      },
    ];
  });
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

async function igComments(mediaId: string, token: string): Promise<RemoteComment[]> {
  const u = new URL(`https://graph.facebook.com/v20.0/${mediaId}/comments`);
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
    if (platform === 'youtube') return await ytComments(externalPostId, accessToken);
    if (platform === 'facebook') return await fbComments(externalPostId, accessToken);
    if (platform === 'instagram') return await igComments(externalPostId, accessToken);
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
    if (platform === 'youtube') {
      const res = await fetch('https://youtube.googleapis.com/youtube/v3/comments?part=snippet', {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ snippet: { parentId: externalCommentId, textOriginal: text } }),
      });
      return res.ok;
    }
    if (platform === 'facebook') {
      const res = await fetch(`https://graph.facebook.com/v20.0/${externalCommentId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, access_token: accessToken }),
      });
      return res.ok;
    }
    if (platform === 'instagram') {
      const res = await fetch(`https://graph.facebook.com/v20.0/${externalCommentId}/replies`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, access_token: accessToken }),
      });
      return res.ok;
    }
  } catch {
    return false;
  }
  return false;
}
