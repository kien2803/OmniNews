import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import {
  IconFacebook,
  IconX,
  IconReddit,
  IconUpload,
  IconThreads,
} from '../components/icons.js';

const DESKS = [
  { name: 'Facebook', freq: 'DSK-01', scope: 'pages_manage_posts', Icon: IconFacebook },
  { name: 'Threads', freq: 'DSK-02', scope: 'threads_content_publish', Icon: IconThreads },
  { name: 'Reddit', freq: 'DSK-03', scope: 'identity · submit', Icon: IconReddit },
  { name: 'X', freq: 'DSK-04', scope: 'tweet.write · offline', Icon: IconX },
] as const;

const WIRE_LOG = [
  { time: '08:40', event: 'story filed — 2,400 chars, 3 photos, 1 link' },
  { time: '08:41', event: 'desk pass — X deck trimmed to 280, Reddit titled' },
  { time: '09:00', event: 'press run — DSK-01 Facebook, DSK-02 Threads out' },
  { time: '09:01', event: 'printed · DSK-01/02 OK — DSK-04 X retry (rate limit)' },
  { time: '09:16', event: 'retry lands · DSK-04 OK — edition complete' },
] as const;

// Uneven cadence on purpose — hand-posting never lands on a metronome.
const MANUAL_TEMPO = [0, 1.85, 4.1, 6.3] as const;

// The fan-out scene: SVG paths (viewBox 320x200) from the story node at
// (160,182) up to each desk. x/y are the endpoints in %, where the HTML
// nodes sit — they stay aligned since the svg stretches with them.
const FANOUT = [
  { d: 'M160 182 C 95 140 55 95 40 44', x: 12.5, y: 22, name: 'Facebook', Icon: IconFacebook },
  { d: 'M160 182 C 132 122 120 72 120 30', x: 37.5, y: 15, name: 'Threads', Icon: IconThreads },
  { d: 'M160 182 C 188 122 200 72 200 30', x: 62.5, y: 15, name: 'Reddit', Icon: IconReddit },
  { d: 'M160 182 C 225 140 265 95 280 44', x: 87.5, y: 22, name: 'X', Icon: IconX },
] as const;

function Eq({ className = '', bars = 3, delay = 0 }: { className?: string; bars?: number; delay?: number }) {
  return (
    <span className={`flex items-end gap-[2px] ${className}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, b) => (
        <span
          key={b}
          className="h-full w-[2px] origin-bottom animate-eq rounded-sm bg-current"
          style={{ animationDelay: `${delay + b * 0.17}s` }}
        />
      ))}
    </span>
  );
}

const CAPABILITIES = [
  ['Sealed desk auth', 'OAuth per platform, tokens encrypted at rest, several desks per account.'],
  ['Write once', 'Title, body, link, photos — one story filed to every desk.'],
  ['Deadline schedule', 'Exact-time publishing, per-desk deck overrides.'],
  ['Self-healing file', 'Backoff retries on transient failure; dead letters flagged, not dropped.'],
  ['Quota governor', 'Per-platform daily budgets enforced before anything goes out.'],
  ['Wire log', 'Full publish history, desk stats and per-platform analytics.'],
] as const;

type RevealVariant = 'up' | 'left' | 'pop';

const HIDDEN: Record<RevealVariant, string> = {
  up: 'translate-y-6 opacity-0 blur-[3px]',
  left: '-translate-x-6 opacity-0 blur-[2px]',
  pop: 'scale-90 opacity-0 blur-[2px]',
};

const EASE: Record<RevealVariant, string> = {
  up: 'cubic-bezier(0.22, 1, 0.36, 1)',
  left: 'cubic-bezier(0.22, 1, 0.36, 1)',
  pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

function Reveal({
  children,
  delay = 0,
  variant = 'up',
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  variant?: RevealVariant;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms`, transitionTimingFunction: EASE[variant] }}
      className={`${className} transition-all duration-[900ms] ${
        seen ? 'translate-x-0 translate-y-0 scale-100 opacity-100 blur-0' : HIDDEN[variant]
      }`}
    >
      {children}
    </div>
  );
}

export function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-surface-muted font-sans text-ink dark:bg-[#1c1917] dark:text-stone-100">
      {/* Masthead */}
      <header className="border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-baseline gap-2.5">
            <img src="/logo.svg" alt="OmniNews" className="h-8 w-8 self-center" />
            <span className="font-display text-2xl font-bold tracking-tight">OmniNews</span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.25em] text-ink-subtle sm:inline dark:text-stone-500">est. mmxxvi</span>
          </Link>
          <nav className="flex items-center gap-2">
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn-primary">Open Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Sign in</Link>
                <Link to="/register" className="btn-primary">Get started</Link>
              </>
            )}
          </nav>
        </div>
        {/* dateline strip — the newspaper's collar */}
        <div className="border-t border-stone-200 dark:border-stone-800">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-subtle dark:text-stone-500">
            <span>vol. 01 · late edition</span>
            <span className="hidden sm:inline">filed daily from every desk</span>
            <span>price: one story</span>
          </div>
        </div>
      </header>

      {/* Act I — masthead: editorial identity over a live wire */}
      <section className="relative overflow-hidden border-b border-stone-200 dark:border-stone-800">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {/* drifting wires — each layer also bobs, so the drift
              never reads as a straight conveyor belt */}
          <div className="absolute bottom-8 left-0 h-14 w-full animate-bob-a">
            <svg
              className="h-full w-[200%] min-w-[1600px] animate-wave-a text-stone-300/80 dark:text-stone-700/70"
              viewBox="0 0 2400 64"
              preserveAspectRatio="none"
              fill="none"
            >
              <path
                d="M0 32 Q150 8 300 32 T600 32 T900 32 T1200 32 T1500 32 T1800 32 T2100 32 T2400 32"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          <div className="absolute bottom-14 left-0 h-14 w-full animate-bob-b">
            <svg
              className="h-full w-[200%] min-w-[1600px] animate-wave-b text-brand-500/25 dark:text-brand-500/20"
              viewBox="0 0 2400 64"
              preserveAspectRatio="none"
              fill="none"
            >
              <path
                d="M0 38 Q150 58 300 38 T600 38 T900 38 T1200 38 T1500 38 T1800 38 T2100 38 T2400 38"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          {/* column rules — two hairlines sweeping the page, out of phase */}
          <div className="absolute inset-y-0 w-px animate-sweep bg-stone-400/40 dark:bg-stone-500/30" />
          <div className="absolute inset-y-0 w-px animate-sweep bg-stone-300/50 [animation-delay:-6.5s] dark:bg-stone-600/40" />
          {/* the desk — a breathing source radiating deadline rings */}
          <div className="absolute right-12 top-10 hidden h-32 w-32 md:block">
            <span className="absolute inset-0 animate-ring rounded-full border border-brand-500/50 dark:border-brand-500/40" />
            <span className="absolute inset-0 animate-ring rounded-full border border-brand-500/50 [animation-delay:1.4s] dark:border-brand-500/40" />
            <span className="absolute inset-0 animate-ring rounded-full border border-brand-500/50 [animation-delay:2.8s] dark:border-brand-500/40" />
            <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 animate-breathe rounded-full bg-brand-500" />
          </div>
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pb-12 pt-12 md:pt-16">
          <p className="flex animate-hero-in items-center gap-2 font-mono text-xs text-brand-600 dark:text-brand-500">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-500 opacity-75" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-brand-500" />
            </span>
            the wire · multi-desk post scheduler
          </p>
          <h1
            className="mt-4 max-w-3xl animate-hero-in font-display text-4xl font-semibold leading-[1.06] tracking-tight md:text-6xl"
            style={{ animationDelay: '120ms' }}
          >
            One story. Every desk, on deadline.
          </h1>
          <p
            className="mt-2 animate-hero-in font-mono text-[11px] uppercase tracking-[0.2em] text-ink-subtle dark:text-stone-500"
            style={{ animationDelay: '180ms' }}
          >
            by the omninews desk — today's edition
          </p>
          <p
            className="mt-6 max-w-xl animate-hero-in text-base leading-relaxed text-ink-muted dark:text-stone-400"
            style={{ animationDelay: '240ms' }}
          >
            OmniNews files a single story — title, body, link, photos — to
            Facebook, Threads, Reddit and X at the times you set. Retries,
            quotas and the wire log are handled by the desk, not by you.
          </p>
          <div
            className="mt-8 flex animate-hero-in flex-wrap items-center gap-3"
            style={{ animationDelay: '360ms' }}
          >
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn-primary px-6 py-3 text-base">Open Dashboard</Link>
            ) : (
              <>
                <Link to="/register" className="btn-primary px-6 py-3 text-base">Create free account</Link>
                <Link to="/login" className="btn-secondary px-6 py-3 text-base">Sign in</Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Act II — the desks this newsroom files to */}
      <div className="border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-x-6 px-6 sm:grid-cols-4 sm:gap-x-0">
          {DESKS.map(({ name, freq, Icon }, i) => (
            <Reveal
              key={name}
              variant="pop"
              delay={i * 90}
              className="group flex items-center gap-3.5 border-stone-200 py-6 transition-colors hover:bg-surface sm:-mx-3 sm:border-l sm:pl-9 sm:pr-3 sm:first:border-l-0 sm:first:pl-3 dark:border-stone-800 dark:hover:bg-[#221e19]"
            >
              <Icon className="h-6 w-6 shrink-0 text-ink-subtle transition-all duration-300 group-hover:-translate-y-0.5 group-hover:text-brand-600 dark:text-stone-500 dark:group-hover:text-brand-500" />
              <span className="flex min-w-0 flex-col">
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-subtle dark:text-stone-500">
                  {freq}
                </span>
                <span className="truncate font-display text-sm font-medium">{name}</span>
              </span>
              <Eq className="ml-auto h-3.5 text-ink-subtle/70 dark:text-stone-600" delay={i * 0.45} />
            </Reveal>
          ))}
        </div>
      </div>

      <section className="border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <Reveal>
            <h2 className="font-display text-xl font-semibold"><span className="mr-2 font-mono text-xs font-normal text-brand-600 dark:text-brand-500">§01</span>Desk lineup</h2>
          </Reveal>
          <div className="mt-4 border-t border-stone-200 dark:border-stone-800">
            {DESKS.map((s, i) => (
              <Reveal
                key={s.name}
                variant="left"
                delay={i * 80}
                className="grid grid-cols-[88px_1fr_auto] items-baseline gap-4 border-b border-stone-200 py-4 sm:grid-cols-[100px_1fr_1fr] dark:border-stone-800"
              >
                <span className="font-mono text-xs text-ink-subtle dark:text-stone-500">{s.freq}</span>
                <span className="flex items-center gap-2.5 font-display font-medium">
                  <s.Icon className="h-4 w-4" />
                  {s.name}
                </span>
                <span className="font-mono text-xs text-ink-muted dark:text-stone-400">{s.scope}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Act III — by hand vs. one filing */}
      <section className="border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <Reveal>
            <p className="font-mono text-xs text-brand-600 dark:text-brand-500">
              §02 · by hand → one filing
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-2xl font-semibold tracking-tight md:text-3xl">
              Same story, four desks — one filing.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-muted dark:text-stone-400">
              Cross-posting by hand means signing in and reposting to every
              platform, one account at a time. OmniNews turns it into a single
              filing: write once and the desk puts it on every wire at once.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-8">
            {/* before — one submission per desk, one at a time */}
            <Reveal variant="left" delay={120}>
              <figure>
                <figcaption className="flex items-baseline justify-between border-b border-stone-200 pb-3 font-mono text-[11px] uppercase tracking-widest text-ink-subtle dark:border-stone-800 dark:text-stone-500">
                  <span>by hand</span>
                  <span>4 submissions · serial</span>
                </figcaption>
                <div className="mt-6 space-y-3">
                  {DESKS.map(({ name, Icon }, i) => (
                    <div
                      key={name}
                      className="rounded-sm border border-stone-200 bg-surface px-3 py-2.5 shadow-soft dark:border-stone-700 dark:bg-[#262019]"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-ink-subtle dark:text-stone-500" />
                        <span className="font-mono text-[10px] text-ink-muted dark:text-stone-400">
                          {name} · posting…
                        </span>
                        <span
                          className="ml-auto animate-done-pop font-mono text-[9px] uppercase tracking-widest text-success-500"
                          style={{ animationDelay: `${MANUAL_TEMPO[i]}s` }}
                        >
                          done
                        </span>
                      </div>
                      <div className="relative mt-2 h-1 rounded-sm bg-stone-200 dark:bg-stone-700">
                        <div
                          className="absolute inset-y-0 left-0 w-0 animate-sig-bar rounded-sm bg-brand-500"
                          style={{ animationDelay: `${MANUAL_TEMPO[i]}s` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-6 font-mono text-[11px] text-ink-subtle dark:text-stone-500">
                  elapsed — one desk at a time
                </p>
              </figure>
            </Reveal>

            {/* after — one filing, on every wire at once */}
            <Reveal delay={240}>
              <figure>
                <figcaption className="flex items-baseline justify-between border-b border-stone-200 pb-3 font-mono text-[11px] uppercase tracking-widest text-ink-subtle dark:border-stone-800 dark:text-stone-500">
                  <span>on omninews</span>
                  <span>1 filing · parallel</span>
                </figcaption>
                {/* wire map — copy rides the curves to every desk at once;
                    desks flash as each filing lands */}
                <div className="relative mt-6 h-60" role="img" aria-label="One story filed to Facebook, Threads, Reddit and X at the same time">
                  <svg
                    className="absolute inset-0 h-full w-full text-stone-300 dark:text-stone-600"
                    viewBox="0 0 320 200"
                    preserveAspectRatio="none"
                    fill="none"
                    aria-hidden="true"
                  >
                    {FANOUT.map(({ d }) => (
                      <path key={d} d={d} stroke="currentColor" strokeWidth="1" strokeDasharray="2 6" />
                    ))}
                    {FANOUT.flatMap(({ d }, i) =>
                      [0, 1.3].map((off) => (
                        <circle key={`${i}-${off}`} r="3" className="motion-hide fill-brand-500">
                          <animateMotion dur="2.6s" begin={`${i * 0.4 + off}s`} repeatCount="indefinite" path={d} />
                        </circle>
                      )),
                    )}
                  </svg>
                  {FANOUT.map(({ x, y, name, Icon }, i) => (
                    <span
                      key={name}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${x}%`, top: `${y}%` }}
                    >
                      <span
                        className="flex animate-node-pop flex-col items-center gap-1"
                        style={{ animationDelay: `${i * 0.4}s` }}
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-stone-200 bg-surface shadow-soft dark:border-stone-700 dark:bg-[#262019]">
                          <Icon className="h-4 w-4 text-ink dark:text-stone-200" />
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-subtle dark:text-stone-500">
                          {name}
                        </span>
                      </span>
                    </span>
                  ))}
                  <span className="absolute left-1/2 top-[91%] flex h-14 w-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-sm border border-stone-200 bg-surface shadow-soft dark:border-stone-700 dark:bg-[#262019]">
                    <span className="absolute inset-0 animate-ring rounded-sm border border-brand-500/50" />
                    <IconUpload className="h-4 w-4 text-brand-600 dark:text-brand-500" />
                    <span className="font-mono text-[9px] text-ink-subtle dark:text-stone-500">story.md</span>
                  </span>
                </div>
                <p className="mt-6 font-mono text-[11px] text-ink-subtle dark:text-stone-500">
                  filed — every desk at once
                </p>
              </figure>
            </Reveal>
          </div>
        </div>
      </section>

      {/* The proof — a press day, logged */}
      <section className="border-b border-stone-200 bg-surface dark:border-stone-800 dark:bg-[#211d18]">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <Reveal>
            <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold">
              <span className="font-mono text-xs font-normal text-brand-600 dark:text-brand-500">§03</span>A press day
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand-500 opacity-75" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-brand-500" />
              </span>
            </h2>
          </Reveal>
          <div className="mt-4 border-t border-stone-200 font-mono text-sm dark:border-stone-800">
            {WIRE_LOG.map((e, i) => (
              <Reveal
                key={i}
                variant="left"
                delay={i * 90}
                className="grid grid-cols-[64px_1fr] gap-4 border-b border-stone-200 py-3.5 dark:border-stone-800"
              >
                <span className="text-ink-subtle dark:text-stone-500">{e.time}</span>
                <span className="text-ink-muted dark:text-stone-300">{e.event}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Act IV — what the desk handles for you */}
      <section className="border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <Reveal>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold"><span className="mr-2 font-mono text-xs font-normal text-brand-600 dark:text-brand-500">§04</span>Inside the newsroom</h2>
              <Eq className="h-5 text-brand-500/80" bars={5} />
            </div>
          </Reveal>
          <div className="mt-4 border-t border-stone-200 dark:border-stone-800">
            {CAPABILITIES.map(([title, body], i) => (
              <Reveal
                key={title}
                delay={i * 70}
                className="group grid gap-1 border-b border-stone-200 py-5 hover:bg-surface sm:grid-cols-[240px_1fr] sm:gap-8 sm:-mx-3 sm:px-3 dark:border-stone-800 dark:hover:bg-[#221e19]"
              >
                <h3 className="font-display text-base font-medium transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-500">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted dark:text-stone-400">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Sign off */}
      {!isAuthenticated && (
        <section className="border-b border-stone-200 dark:border-stone-800">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <Reveal>
              <h2 className="font-display text-2xl font-semibold">File your first story</h2>
              <p className="mt-2 max-w-md text-sm text-ink-muted dark:text-stone-400">
                Create an account, connect a desk, and put your first story on
                the wire in minutes.
              </p>
              <Link to="/register" className="btn-primary mt-6 inline-flex px-6 py-3 text-base">
                Get started
              </Link>
            </Reveal>
          </div>
        </section>
      )}

      <footer className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 font-mono text-xs text-ink-subtle dark:text-stone-500">
        <span>OmniNews — post scheduling for Facebook, Threads, Reddit &amp; X</span>
        <span className="hidden md:inline">typeset in IBM Plex · printed on Cloudflare · all desks on deadline</span>
        <Link to="/privacy" className="underline underline-offset-2 hover:text-ink dark:hover:text-stone-300">Privacy</Link>
      </footer>
    </div>
  );
}
