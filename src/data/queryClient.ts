// The app's one QueryClient (main.tsx). A write waits for the server, never for the screens it changed to download again.
import { QueryClient } from '@tanstack/react-query';

/**
 * invalidateQueries marks the matching queries stale and starts reloading the ones on screen, then returns at once.
 * TanStack's own waits for those reloads, and every write here returns or awaits it from onSuccess / onSettled, which
 * keeps the write pending (the button spinning, the form open, the next screen waiting) until each list it touched has
 * come back. Jesse, Oct 5: submitting a daily, an IR request or an RFI "lags". Now a write is done when the server
 * answers and the lists refresh behind the next screen. Where a screen shows the written row in place, its mutation
 * puts the server's answer into the cache (setQueryData) so nothing old shows meanwhile.
 */
class AppQueryClient extends QueryClient {
  override invalidateQueries(...args: Parameters<QueryClient['invalidateQueries']>): Promise<void> {
    // Never rejects: a failed reload stays on its query, and its screen shows the error with Try again.
    void super.invalidateQueries(...args);
    return Promise.resolve();
  }
}

export function createQueryClient(): QueryClient {
  return new AppQueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
      mutations: { retry: 0 },
    },
  });
}
