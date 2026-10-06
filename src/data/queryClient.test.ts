import { describe, expect, it, vi } from 'vitest';
import { MutationObserver, QueryObserver } from '@tanstack/react-query';
import { createQueryClient } from './queryClient';

describe('the app QueryClient', () => {
  it('a write is done when the server answers; the lists it touched reload behind it', async () => {
    const qc = createQueryClient();
    let reloads = 0;
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // A list on screen whose reload takes as long as the test says.
    const list = new QueryObserver(qc, {
      queryKey: ['list'],
      queryFn: async () => {
        reloads += 1;
        if (reloads > 1) await held;
        return reloads;
      },
    });
    const unsubscribe = list.subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(qc.getQueryData(['list'])).toBe(1);
    });

    // A write that refreshes the list from onSuccess, as every mutation in src/data does.
    const write = new MutationObserver(qc, {
      mutationFn: () => Promise.resolve('saved'),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['list'] }),
    });
    await expect(write.mutate()).resolves.toBe('saved');
    // The write is done while the list is still reloading (TanStack's own client would still be waiting here).
    expect(qc.getQueryState(['list'])?.fetchStatus).toBe('fetching');
    expect(qc.getQueryData(['list'])).toBe(1);

    release();
    await vi.waitFor(() => {
      expect(qc.getQueryData(['list'])).toBe(2);
    });
    unsubscribe();
    qc.clear();
  });
});
