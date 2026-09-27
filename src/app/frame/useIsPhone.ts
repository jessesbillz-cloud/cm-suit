// Under 768px the app switches to its own phone layout (SPEC §7.7). It never shrinks the desktop frame.
import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => {
    mql.removeEventListener('change', onChange);
  };
}

function snapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
