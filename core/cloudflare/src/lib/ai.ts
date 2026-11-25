import type { Env } from '../env';
import type { Platform } from '../repos/types';
import { PLATFORM_LIMITS } from './platforms';
import { fitTitle, fitText } from './platforms';
import { xWeightedLength, type PostVariant } from './variants';

export interface GenerateInput {
  platform: Platform;
  article: { title: string; body: string; link_url: string; images: string[] };
  /** Reddit subreddit / per-account target — shapes community-aware copy. */
  target?: string;
  tone?: 'neutral' | 'professional' | 'casual';
  /** Output language — 'keep' preserves the article's language. */
  language?: 'keep' | 'english' | 'vietnamese';
}

export interface GenerateResult {
  variant: PostVariant;
  /** 'ai' = real provider call; 'offline' = deterministic fallback draft. */
  source: 'ai' | 'offline';
  model?: string;
}

// ── Prompt ────────────────────────────────────────────────────────────

const PLATFORM_STYLE: Record<Platform, string> = {
  facebook: 'Clear opening sentence. Informative short paragraphs. One natural engagement question at the end if it fits. Put the link where it reads naturally.',
  threads: 'Conversational, concise, no promotional language. Reads like a person wrote it, not a brand.',
  reddit: 'Community-appropriate and contextual — never generic promo cross-posting. Write a genuine title and a detailed but honest body for a self-post.',
  x: 'Concise, strong first line, clear. Link may be appended. Respect the hard character limit.',
};

function systemPrompt(i: GenerateInput): string {
  const lim = PLATFORM_LIMITS[i.platform];
  const lang = i.language === 'english' ? 'Write in English.'
    : i.language === 'vietnamese' ? 'Write in Vietnamese.'
    : "Write in the same language as the article.";
  return [
    'You adapt one article into a social platform post. Rules:',
    '- Preserve the article\'s meaning and the author\'s position. Never invent facts, statistics, quotes, dates, names or sources.',
    '- Keep real names, numbers, dates and URLs from the article.',
    '- Sound natural, not mechanically rewritten. No generic AI openers.',
    `- Style for ${i.platform}: ${PLATFORM_STYLE[i.platform]}`,
    `- Hard text limit: ${lim.text} characters${i.platform === 'x' ? ' (URLs count as 23 chars each)' : ''}.`,
    i.platform === 'reddit' ? '- Return a "title" field (max 300 chars) — Reddit requires it.' : '- Do not return a title unless it adds something the text lacks.',
    i.target ? `- The post targets "${i.target}" — match that community's tone.` : '',
    `- Tone: ${i.tone ?? 'neutral'}. ${lang}`,
    'Respond with JSON only: {"text": "..."} or {"title": "...", "text": "..."}.',
  ].filter(Boolean).join('\n');
}

function userPrompt(article: GenerateInput['article']): string {
  return [
    'ARTICLE',
    `Title: ${article.title || '(none)'}`,
    `Body: ${article.body || '(none)'}`,
    article.link_url ? `Link: ${article.link_url}` : 'Link: (none)',
    `Images available: ${article.images.length}`,
  ].join('\n');
}

// ── Providers ─────────────────────────────────────────────────────────

interface AiResponse { text?: string; title?: string }

/** Tolerant JSON extraction — providers often wrap JSON in prose/fences. */
export function parseAiJson(raw: string): AiResponse | null {
  const cleaned = raw.replace(/```(?:json)?|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as AiResponse;
    if (typeof obj !== 'object' || obj === null) return null;
    if (obj.text !== undefined && typeof obj.text !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}

async function callAnthropic(env: Env, i: GenerateInput): Promise<AiResponse> {
  const model = env.AI_MODEL || 'claude-haiku-4-5-20251001';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.AI_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: systemPrompt(i),
      messages: [{ role: 'user', content: userPrompt(i.article) }],
    }),
  });
  const j = (await res.json()) as { content?: Array<{ text?: string }>; error?: { message?: string } };
  if (!res.ok) throw new Error(`anthropic_api: ${j.error?.message ?? res.status}`);
  const text = j.content?.[0]?.text;
  if (!text) throw new Error('anthropic_api: empty completion');
  const parsed = parseAiJson(text);
  if (!parsed?.text) throw new Error('anthropic_api: malformed response');
  return parsed;
}

async function callOpenAi(env: Env, i: GenerateInput): Promise<AiResponse> {
  const model = env.AI_MODEL || 'gpt-4o-mini';
  const base = (env.AI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.AI_API_KEY}` },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(i) },
        { role: 'user', content: userPrompt(i.article) },
      ],
    }),
  });
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!res.ok) throw new Error(`openai_api: ${j.error?.message ?? res.status}`);
  const content = j.choices?.[0]?.message?.content;
  const parsed = content ? parseAiJson(content) : null;
  if (!parsed?.text) throw new Error('openai_api: malformed response');
  return parsed;
}

// ── Offline fallback ──────────────────────────────────────────────────

/** Deterministic, honest adaptation when no AI provider is configured.
 *  Reshapes the article — never invents content. Marked source:'offline'. */
export function buildOfflineVariant(i: GenerateInput): PostVariant {
  const a = i.article;
  const base = [a.title, a.body].filter((s) => s?.trim()).join('\n\n').trim();

  const variant: PostVariant = {};
  if (i.platform === 'x') {
    // Cut at a sentence boundary inside the weighted budget.
    const budget = 280 - (a.link_url ? 25 : 0);
    let text = '';
    for (const line of base.split(/\n+/)) {
      for (const sentence of line.split(/(?<=[.!?\u2026])\s+/)) {
        if (!sentence) continue;
        const candidate = text ? `${text}\n${sentence}` : sentence;
        if (xWeightedLength(candidate) > budget) break;
        text = candidate;
      }
      if (xWeightedLength(text) > budget - 40) break;
    }
    variant.text = fitText('x', text || base);
  } else if (i.platform === 'threads') {
    variant.text = fitText('threads', base.split(/\n\n+/)[0] || base);
  } else if (i.platform === 'reddit') {
    variant.title = fitTitle('reddit', a.title || base.split('\n')[0] || '');
    variant.text = fitText('reddit', base);
    variant.reddit_kind = a.link_url ? 'link' : 'self';
  } else {
    variant.text = fitText('facebook', base);
  }
  return variant;
}

// ── Entry point ───────────────────────────────────────────────────────

/** Adapt one article into a platform variant. Falls back to the
 *  deterministic offline drafter when no provider key is configured. */
export async function generateVariant(env: Env, i: GenerateInput): Promise<GenerateResult> {
  const provider = (env.AI_PROVIDER || '').toLowerCase();
  if (env.AI_API_KEY && (provider === 'anthropic' || provider === 'openai')) {
    try {
      const raw = provider === 'anthropic' ? await callAnthropic(env, i) : await callOpenAi(env, i);
      const variant: PostVariant = {};
      if (raw.text?.trim()) variant.text = fitText(i.platform, raw.text.trim());
      if (i.platform === 'reddit') {
        if (raw.title?.trim()) variant.title = fitTitle('reddit', raw.title.trim());
        if (!variant.title) variant.title = fitTitle('reddit', i.article.title || raw.text!.split('\n')[0] || '');
      }
      if (!variant.text && !variant.title) throw new Error('ai_empty_output');
      return { variant, source: 'ai', model: env.AI_MODEL || provider };
    } catch {
      // Provider failure must never block the composer — fall back.
      return { variant: buildOfflineVariant(i), source: 'offline' };
    }
  }
  return { variant: buildOfflineVariant(i), source: 'offline' };
}
