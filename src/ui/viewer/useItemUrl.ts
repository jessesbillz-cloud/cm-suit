// The URL a viewer item shows, asked for once per item (and again on Try again). The item's `url()` is read through a
// ref, so a caller that rebuilds its items on every render does not ask again.
import { useCallback, useEffect, useRef, useState } from 'react';

type Answer = { key: string } & ({ status: 'ready'; url: string } | { status: 'error'; error: Error });

type ItemUrl = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error'; error: Error };

export function useItemUrl(id: string, url: () => Promise<string>): { state: ItemUrl; retry: () => void } {
  const latest = useRef(url);
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const key = `${id}#${String(attempt)}`;

  useEffect(() => {
    latest.current = url;
  });

  useEffect(() => {
    let live = true;
    latest
      .current()
      .then((u) => {
        if (live) setAnswer({ key, status: 'ready', url: u });
      })
      .catch((e: unknown) => {
        if (live) setAnswer({ key, status: 'error', error: e instanceof Error ? e : new Error('This file did not open.') });
      });
    return () => {
      live = false;
    };
  }, [key]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
  const state: ItemUrl = answer === null || answer.key !== key ? { status: 'loading' } : answer;
  return { state, retry };
}
