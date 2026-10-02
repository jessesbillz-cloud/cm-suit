// Sentry, loaded on its own after the app has started (main.tsx), and only when a DSN is set. Named imports keep the
// rest of the SDK (replay, feedback, tracing) out of the download.
import { init, reactErrorHandler } from '@sentry/react';
import { scrubBreadcrumb, scrubEvent } from './sentryScrub';

/** Starts Sentry; returns how a render error caught by the app's boundary is reported (with its component stack). */
export function startSentry(dsn: string, environment: string): (error: unknown, componentStack: string) => void {
  init({
    dsn,
    environment,
    // No user data in breadcrumbs beyond what Sentry needs; replays are off.
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Link tokens and sign-in secrets never leave the page (sentryScrub.ts).
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  const handle = reactErrorHandler();
  return (error, componentStack) => {
    handle(error, { componentStack });
  };
}
