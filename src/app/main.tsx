// App entry: providers, the one-time status color variables, Sentry when configured.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { SessionProvider } from '../data/SessionProvider';
import { UploadQueueProvider } from '../data/UploadQueue';
import { FUTURE_NAME } from '../lib/brand';
import { statusCssVariables } from '../lib/status';
import { ToastProvider } from '../ui/Toast';
import { router } from './router';
import './styles.css';

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // No user data in breadcrumbs beyond what Sentry needs; replays are off.
    sendDefaultPii: false,
    tracesSampleRate: 0,
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
    <Sentry.ErrorBoundary fallback={<p className="p-6 text-sm text-danger">Something broke. Reload the page to try again.</p>}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SessionProvider>
            <UploadQueueProvider>
              <RouterProvider router={router} />
            </UploadQueueProvider>
          </SessionProvider>
        </ToastProvider>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
