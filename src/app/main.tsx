// App entry: providers, the one-time status color variables, Sentry when configured.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { SessionProvider } from '../data/SessionProvider';
import { UploadQueueProvider } from '../data/UploadQueue';
import { FUTURE_NAME } from '../lib/brand';
import { statusCssVariables } from '../lib/status';
import { ToastProvider } from '../ui/Toast';
import { ErrorBoundary } from './ErrorBoundary';
import { router } from './router';
import './styles.css';

// Sentry loads beside the app, never in front of the first screen, and only when a DSN is set.
const dsn = import.meta.env.VITE_SENTRY_DSN;
const sentry = dsn
  ? import('./sentry').then(
      (m) => m.startSentry(dsn, import.meta.env.MODE),
      (e: unknown) => {
        console.error('Sentry did not load; errors are not reported', e);
        return null;
      },
    )
  : null;

/** A render error caught by the app's boundary goes to Sentry with its component stack, as Sentry's own boundary did. */
function reportRenderError(error: unknown, componentStack: string): void {
  void sentry?.then((report) => {
    if (report) report(error, componentStack);
    else console.error(error);
  });
}

document.title = FUTURE_NAME;

// After a deploy, the service worker serves the old app for the first open, then the new one takes over. If that
// happens right after opening (e.g. a link only the new app knows), reload once; never mid-work.
function reloadOnFreshUpdate(): void {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      if (performance.now() < 30_000) window.location.reload();
    },
    { once: true },
  );
}
reloadOnFreshUpdate();

// Status colors come only from lib/status (SPEC §7.1): injected once as CSS variables.
const statusStyle = document.createElement('style');
statusStyle.textContent = `:root{${statusCssVariables()}}`;
document.head.appendChild(statusStyle);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('index.html is missing #root');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary onError={reportRenderError}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SessionProvider>
            <UploadQueueProvider>
              <RouterProvider router={router} />
            </UploadQueueProvider>
          </SessionProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
