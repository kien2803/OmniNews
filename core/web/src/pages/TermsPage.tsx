import { Link } from 'react-router-dom';

/**
 * Public terms of service — required by TikTok/Meta/Google app review.
 * Keep it reachable without auth at /terms.
 */
export function TermsPage() {
  return (
    <div className="min-h-screen bg-surface text-ink dark:bg-stone-950 dark:text-stone-200">
      <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
        <h1 className="text-3xl font-semibold">Terms of Service</h1>
        <p className="mt-2 text-sm text-ink-subtle dark:text-stone-500">Last updated: November 2026</p>

        <section className="mt-8 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-semibold">1. The service</h2>
          <p>
            Omnicast lets you upload videos, schedule posts, and publish content to social
            media platforms (YouTube, TikTok, Instagram, Facebook) that you connect yourself.
            You authorize each connection via the platform's own OAuth flow and can disconnect
            at any time.
          </p>

          <h2 className="text-lg font-semibold">2. Your content and accounts</h2>
          <p>
            You keep full ownership of your videos and posts. You are responsible for the
            content you publish and for complying with each platform's own terms and content
            policies. We act only on the schedules you set — Omnicast never posts on your
            behalf without a post you explicitly created.
          </p>

          <h2 className="text-lg font-semibold">3. Acceptable use</h2>
          <p>
            Do not use Omnicast to publish content that violates law or platform policies, to
            spam, or to operate accounts you do not own or manage. Abuse may result in account
            suspension.
          </p>

          <h2 className="text-lg font-semibold">4. Availability</h2>
          <p>
            The service is provided "as is". Publishing depends on third-party platform APIs;
            quota limits, outages, or policy changes on those platforms may affect delivery.
            Failed posts are surfaced in the app and can be retried manually.
          </p>

          <h2 className="text-lg font-semibold">5. Termination</h2>
          <p>
            You can delete your account at any time from Settings — this removes your data and
            scheduled posts. We may suspend accounts that violate these terms.
          </p>

          <h2 className="text-lg font-semibold">6. Contact</h2>
          <p>
            Questions about these terms: contact the operator via the email on your account
            page.
          </p>
        </section>

        <p className="mt-10 text-sm text-ink-subtle dark:text-stone-500">
          <Link to="/" className="underline hover:text-ink">← Back to Omnicast</Link>
          {' · '}
          <Link to="/privacy" className="underline hover:text-ink">Privacy Policy</Link>
        </p>
      </main>
    </div>
  );
}
