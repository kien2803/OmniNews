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
  { name: 'Facebook', desk: 'DSK-01', scope: 'pages_manage_posts', Icon: IconFacebook },
  { name: 'Threads', desk: 'DSK-02', scope: 'threads_content_publish', Icon: IconThreads },
  { name: 'Reddit', desk: 'DSK-03', scope: 'identity · submit', Icon: IconReddit },
  { name: 'X', desk: 'DSK-04', scope: 'tweet.write · offline', Icon: IconX },
] as const;

const WIRE_LOG = [
  { time: '08:40', event: 'story filed — 2,400 chars, 3 photos, 1 link' },
  { time: '08:41', event: 'desk pass — X deck trimmed to 280, Reddit titled' },
  { time: '09:00', event: 'press run — DSK-01 Facebook, DSK-02 Threads out' },
  { time: '09:01', event: 'printed · DSK-01/02 OK — DSK-04 X retry (rate limit)' },
  { time: '09:16', event: 'retry lands · DSK-04 OK — edition complete' },
] as const;

const CAPABILITIES = [
  ['Sealed desk auth', 'OAuth per platform, tokens encrypted at rest, several desks per account.'],
  ['Write once', 'Title, body, link, photos — one story filed to every desk.'],
  ['Deadline schedule', 'Exact-time publishing, per-desk deck overrides.'],
  ['Self-healing file', 'Backoff retries on transient failure; dead letters flagged, not dropped.'],
  ['Quota governor', 'Per-platform daily budgets enforced before anything goes out.'],
  ['Wire log', 'Full publish history, desk stats and per-platform analytics.'],
] as const;

// Figure 1 — the wire map. SVG paths (viewBox 320x200) from the story node
// at (160,182) up to each desk. x/y are endpoint positions in %.
const FANOUT = [
  { d: 'M160 182 C 95 140 55 95 40 44', x: 12.5, y: 22, name: 'Facebook', Icon: IconFacebook },
  { d: 'M160 182 C 132 122 120 72 120 30', x: 37.5, y: 15, name: 'Threads', Icon: IconThreads },
  { d: 'M160 182 C 188 122 200 72 200 30', x: 62.5, y: 15, name: 'Reddit', Icon: IconReddit },
  { d: 'M160 182 C 225 140 265 95 280 44', x: 87.5, y: 22, name: 'X', Icon: IconX },
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

/** Shared observer — CSS animations run at mount, so below-fold pieces
 *  (rules, stamps, the wire sketch) only get their animation class once
 *  the element is actually on screen. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
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

  return [ref, seen] as const;
}

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
  const [ref, seen] = useInView<HTMLDivElement>();

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

/** Print rule — draws itself left→right when it scrolls into view. */
function Rule({ delay = 0 }: { delay?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{ animationDelay: `${delay}ms` }}
      className={`origin-left border-t-4 border-double border-ink/70 dark:border-stone-400/60 ${
        seen ? 'animate-rule-draw' : 'scale-x-0'
      }`}
    />
  );
}

/** Rubber stamp on the classified box — slams in once it scrolls into view. */
function Stamp() {
  const [ref, seen] = useInView<HTMLSpanElement>();
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`absolute -right-3 -top-7 flex h-20 w-20 items-center justify-center rounded-full border-2 border-brand-600/70 text-center font-mono text-[9px] font-medium uppercase leading-[1.35] tracking-[0.15em] text-brand-600/80 dark:border-brand-500/70 dark:text-brand-500/80 ${
        seen ? 'animate-stamp-slam' : 'opacity-0'
      }`}
      style={{ animationDelay: '0.4s' }}
    >
      free
      <br />
      press
      <br />
      est. 26
    </span>
  );
}

/** § header — numbered section masthead with a double rule, newspaper style. */
function SectionHead({ n, title, kicker }: { n: string; title: string; kicker?: string }) {
  return (
    <Reveal>
      <Rule />
      <div className="pt-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            <span className="mr-2.5 font-mono text-xs font-normal text-brand-600 dark:text-brand-500">{n}</span>
            {title}
          </h2>
          {kicker && (
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle sm:inline dark:text-stone-500">
              {kicker}
            </span>
          )}
        </div>
      </div>
    </Reveal>
  );
}

/** Fig 1 — the wire map as a print figure: each wire is first sketched in
 *  pencil (solid hairline sweep), then the inked dashed wire appears; red
 *  copy packets run the wires once ink is down. */
function WireFigure() {
  const [ref, seen] = useInView<HTMLElement>();
  return (
    <figure ref={ref} className="border border-ink/60 bg-surface p-4 dark:border-stone-500/60 dark:bg-[#211d18]">
      <div className="relative h-56" role="img" aria-label="One story filed to Facebook, Threads, Reddit and X at the same time">
        <svg
          className="absolute inset-0 h-full w-full text-ink/40 dark:text-stone-500"
          viewBox="0 0 320 200"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          {seen &&
            FANOUT.map(({ d }, i) => (
              <path
                key={`sketch-${d}`}
                d={d}
                stroke="currentColor"
                strokeWidth="0.8"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset="1"
                className="animate-wire-sketch text-ink/60 dark:text-stone-400"
                style={{ animationDelay: `${0.15 + i * 0.35}s` }}
              />
            ))}
          {seen &&
            FANOUT.map(({ d }, i) => (
              <path
                key={`ink-${d}`}
                d={d}
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="3 5"
                className="animate-wire-ink"
                style={{ animationDelay: `${0.15 + i * 0.35}s` }}
              />
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
              <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-stone-300 bg-surface shadow-soft dark:border-stone-600 dark:bg-[#262019]">
                <Icon className="h-4 w-4 text-ink dark:text-stone-200" />
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-ink-subtle dark:text-stone-500">
                {name}
              </span>
            </span>
          </span>
        ))}
        <span className="absolute left-1/2 top-[91%] flex h-14 w-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-sm border border-ink/50 bg-surface shadow-soft dark:border-stone-500 dark:bg-[#262019]">
          <span className="absolute inset-0 animate-ring rounded-sm border border-brand-500/50" />
          <IconUpload className="h-4 w-4 text-brand-600 dark:text-brand-500" />
          <span className="font-mono text-[9px] text-ink-subtle dark:text-stone-500">story.md</span>
        </span>
      </div>
      <figcaption className="mt-3 border-t border-stone-200 pt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle dark:border-stone-700 dark:text-stone-500">
        fig. 1 — one filing reaches four desks
      </figcaption>
    </figure>
  );
}

export function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-[#f7f4ec] font-sans text-ink dark:bg-[#171410] dark:text-stone-100">
      {/* ── Masthead ─────────────────────────────────────────────────── */}
      <header>
        <div className="border-b border-stone-300/80 dark:border-stone-800">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-subtle dark:text-stone-500">
            <span>the newsroom for social posts</span>
            <nav className="flex items-center gap-3 normal-case tracking-normal">
              {isAuthenticated ? (
                <Link to="/dashboard" className="btn-primary !px-3 !py-1 text-xs">Open Dashboard</Link>
              ) : (
                <>
                  <Link to="/login" className="hover:text-ink dark:hover:text-stone-300">Sign in</Link>
                  <Link to="/register" className="btn-primary !px-3 !py-1 text-xs">Get started</Link>
                </>
              )}
            </nav>
          </div>
        </div>
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pb-4 pt-6 text-center">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-10 w-10" />
            <span className="font-display text-5xl font-bold tracking-tight md:text-6xl">OmniNews</span>
          </div>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-subtle dark:text-stone-500">
            all the desks that fit to print · est. mmxxvi
          </p>
        </div>
        <Rule />
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-subtle dark:text-stone-500">
          <span>vol. 01 · late edition</span>
          <span className="hidden sm:inline">filed daily from every desk</span>
          <span>price: one story</span>
        </div>
        <Rule delay={180} />
        <div className="flex items-center bg-ink text-surface dark:bg-stone-100 dark:text-ink" aria-hidden="true">
          <span className="flex shrink-0 items-center gap-1.5 border-r border-surface/25 py-1.5 pl-4 pr-3 font-mono text-[10px] uppercase tracking-[0.25em] text-brand-500 dark:border-ink/25 dark:text-brand-600">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-brand-500 dark:bg-brand-600" />
            live
          </span>
          <div className="flex-1 overflow-hidden py-1.5">
            <div className="flex w-max animate-marquee gap-8 whitespace-nowrap px-4 font-mono text-[11px]">
            {[0, 1].map((dup) => (
              <span key={dup} className="flex gap-8">
                {WIRE_LOG.map((e, i) => (
                  <span key={i}><span className="opacity-60">{e.time}</span> · {e.event} <span className="px-3 text-brand-500">◆</span></span>
                ))}
              </span>
            ))}
            </div>
          </div>
        </div>
      </header>

      {/* ── Front page — banner headline + lead story + figure rail ──── */}
      <section className="border-b border-stone-300/80 dark:border-stone-800">
        <div className="mx-auto max-w-5xl px-6 pb-12 pt-10 md:pt-14">
          <h1 className="max-w-4xl font-display text-[11.5vw] font-bold leading-[0.98] tracking-tight sm:text-6xl md:text-7xl">
            {['File one story.', 'Every desk', 'prints it.'].map((line, i) => (
              <span
                key={line}
                className="block animate-press-in"
                style={{ animationDelay: `${i * 160}ms` }}
              >
                {line}
              </span>
            ))}
          </h1>
          <p className="mt-5 font-mono text-[11px] uppercase text-ink-subtle dark:text-stone-500">
            <span className="inline-block w-0 animate-type overflow-hidden whitespace-nowrap align-bottom">
              by the omninews desk — today's edition
            </span>
            <span className="ml-0.5 inline-block h-3 w-[2px] animate-blink bg-brand-600 align-bottom dark:bg-brand-500" aria-hidden="true" />
          </p>

          <div className="mt-8 grid gap-10 md:grid-cols-[1fr_320px] md:gap-12">
            {/* lead story column */}
            <div>
              <p
                className="animate-hero-in max-w-xl text-[15px] leading-[1.75] text-ink-muted dark:text-stone-400"
                style={{ animationDelay: '240ms' }}
              >
                OmniNews files a single story — title, body, link, photos — to
                Facebook, Threads, Reddit and X at the times you set. Retries,
                quotas and the wire log are handled by the desk, not by you.
              </p>
              <div
                className="mt-7 flex animate-hero-in flex-wrap items-center gap-3"
                style={{ animationDelay: '340ms' }}
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

              {/* pull quote — the pitch restated as a front-page quote */}
              <blockquote
                className="mt-10 animate-hero-in border-l-2 border-brand-600 pl-5 font-display text-xl italic leading-snug text-ink dark:border-brand-500 dark:text-stone-200"
                style={{ animationDelay: '440ms' }}
              >
                "The desk remembers every deadline, so you don't have to."
              </blockquote>
            </div>

            {/* figure rail — lead image slot is our product's own diagram */}
            <div className="animate-hero-in" style={{ animationDelay: '300ms' }}>
              <WireFigure />
              {/* in this edition — boxed index */}
              <nav className="mt-6 border border-ink/60 p-4 dark:border-stone-500/60" aria-label="Inside this edition">
                <p className="border-b border-stone-200 pb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-subtle dark:border-stone-700 dark:text-stone-500">
                  inside this edition
                </p>
                {[
                  ['§01', 'Desk lineup', '#desks'],
                  ['§02', 'By hand → one filing', '#wire'],
                  ['§03', 'A press day', '#pressday'],
                  ['§04', 'Inside the newsroom', '#newsroom'],
                ].map(([n, t, href]) => (
                  <a
                    key={n}
                    href={href}
                    className="group mt-3 flex items-baseline gap-3 font-display text-sm transition-colors hover:text-brand-600 dark:hover:text-brand-500"
                  >
                    <span className="font-mono text-xs text-brand-600 dark:text-brand-500">{n}</span>
                    <span className="flex-1 border-b border-dotted border-stone-300 dark:border-stone-700" aria-hidden="true" />
                    <span className="text-ink-muted group-hover:text-brand-600 dark:text-stone-400">{t}</span>
                  </a>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* ── §01 Desk lineup — the staff box ──────────────────────────── */}
      <section id="desks" className="scroll-mt-6 border-b border-stone-300/80 dark:border-stone-800">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <SectionHead n="§01" title="Desk lineup" kicker="the desks this newsroom files to" />
          <div className="mt-6 border-t border-stone-300/80 dark:border-stone-700">
            {DESKS.map((s, i) => (
              <Reveal
                key={s.name}
                variant="left"
                delay={i * 80}
                className="grid grid-cols-[84px_1fr_auto] items-baseline gap-4 border-b border-stone-300/80 py-4 sm:grid-cols-[100px_1fr_1fr] dark:border-stone-700"
              >
                <span className="font-mono text-xs text-ink-subtle dark:text-stone-500">{s.desk}</span>
                <span className="flex items-center gap-2.5 font-display font-medium">
                  <s.Icon className="h-4 w-4" />
                  {s.name}
                </span>
                <span className="font-mono text-xs text-ink-muted dark:text-stone-400">{s.scope}</span>
              </Reveal>
            ))}
          </div>
          <Reveal delay={340}>
            <p className="mt-3 font-mono text-[11px] text-ink-subtle dark:text-stone-500">
              four desks, one filing window — more desks can hold the same platform
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── §02 The wire — the lead figure, full width ───────────────── */}
      <section id="wire" className="scroll-mt-6 border-b border-stone-300/80 dark:border-stone-800">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <SectionHead n="§02" title="By hand → one filing" kicker="the relay, drawn" />
          <div className="mt-8 grid items-start gap-10 md:grid-cols-[1fr_1.1fr]">
            <Reveal variant="left" delay={120}>
              <p className="font-display text-xl font-semibold leading-snug">
                Same story, four desks — one filing.
              </p>
              <p className="mt-4 text-sm leading-[1.8] text-ink-muted dark:text-stone-400">
                Cross-posting by hand means signing in and reposting to every
                platform, one account at a time. OmniNews turns it into a
                single filing: write once and the desk puts it on every wire
                at once — on the deadline you set, in the deck that platform
                allows.
              </p>
              <ul className="mt-5 space-y-2.5 border-t border-stone-300/80 pt-5 text-sm dark:border-stone-700">
                {[
                  ['before', 'four sign-ins, four uploads, serial — an afternoon gone'],
                  ['after', 'one filing, parallel — the desk does the walking'],
                ].map(([k, v]) => (
                  <li key={k} className="flex items-baseline gap-3">
                    <span className={`font-mono text-[10px] uppercase tracking-widest ${k === 'after' ? 'text-brand-600 dark:text-brand-500' : 'text-ink-subtle dark:text-stone-500'}`}>{k}</span>
                    <span className="text-ink-muted dark:text-stone-400">{v}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={240}>
              <WireFigure />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── §03 A press day — the wire, logged ───────────────────────── */}
      <section id="pressday" className="scroll-mt-6 border-b border-stone-300/80 bg-surface dark:border-stone-800 dark:bg-[#211d18]">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <SectionHead n="§03" title="A press day" kicker="from the wire — every filing logged" />
          <div className="mt-6 border-t border-stone-300/80 font-mono text-sm dark:border-stone-700">
            {WIRE_LOG.map((e, i) => (
              <Reveal
                key={i}
                variant="left"
                delay={i * 90}
                className="grid grid-cols-[64px_1fr] gap-4 border-b border-stone-300/80 py-3.5 dark:border-stone-700"
              >
                <span className="text-ink-subtle dark:text-stone-500">{e.time}</span>
                <span className="text-ink-muted dark:text-stone-300">{e.event}</span>
              </Reveal>
            ))}
          </div>
          <Reveal delay={460}>
            <p className="mt-3 font-mono text-[11px] text-ink-subtle dark:text-stone-500">
              retries are quiet; the log is not — every attempt is on the record
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── §04 Inside the newsroom — what the desk handles ──────────── */}
      <section id="newsroom" className="scroll-mt-6 border-b border-stone-300/80 dark:border-stone-800">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <SectionHead n="§04" title="Inside the newsroom" kicker="what the desk handles for you" />
          <div className="mt-6 border-t border-stone-300/80 dark:border-stone-700">
            {CAPABILITIES.map(([title, body], i) => (
              <Reveal
                key={title}
                delay={i * 70}
                className="group grid gap-1 border-b border-stone-300/80 py-5 sm:grid-cols-[240px_1fr] sm:gap-8 dark:border-stone-700"
              >
                <h3 className="font-display text-base font-medium transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-500">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted dark:text-stone-400">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Classified — the order box ───────────────────────────────── */}
      {!isAuthenticated && (
        <section className="border-b border-stone-300/80 dark:border-stone-800">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <Reveal>
              <div className="relative mx-auto max-w-xl">
                <Stamp />
                <Rule />
                <div className="px-6 py-8 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-subtle dark:text-stone-500">
                    classified · subscriptions open
                  </p>
                  <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">File your first story</h2>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted dark:text-stone-400">
                    Create an account, connect a desk, and put your first story on
                    the wire in minutes. Free to start — no card, no circulation
                    department.
                  </p>
                  <Link to="/register" className="btn-primary mt-6 inline-flex px-6 py-3 text-base">
                    Get started
                  </Link>
                </div>
                <Rule delay={140} />
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* —30— the traditional press end-mark */}
      <Reveal delay={150}>
        <p className="border-b border-stone-300/80 py-6 text-center font-mono text-sm tracking-[0.5em] text-ink-subtle dark:border-stone-800 dark:text-stone-600" aria-hidden="true">
          —30—
        </p>
      </Reveal>

      <footer className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 font-mono text-xs text-ink-subtle dark:text-stone-500">
        <span>OmniNews — post scheduling for Facebook, Threads, Reddit &amp; X</span>
        <span className="hidden md:inline">typeset in IBM Plex · printed on Cloudflare · all desks on deadline</span>
        <Link to="/privacy" className="underline underline-offset-2 hover:text-ink dark:hover:text-stone-300">Privacy</Link>
      </footer>
    </div>
  );
}
