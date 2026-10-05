// "Still allowed?" for a deadline: true until the moment passes, then the screen re-renders once on its own. An Undo
// that the database allows for a while (a new correction, a closed meeting: 15 minutes) stays on the item that long.
import { useEffect, useState } from 'react';

/** True while now is before `deadlineMs` (null: never). Flips to false at the deadline without a reload. */
export function useBefore(deadlineMs: number | null): boolean {
  // Only a tick to re-render at the deadline; the answer reads the clock each render.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (deadlineMs === null) return undefined;
    const left = deadlineMs - Date.now();
    if (left <= 0) return undefined;
    // setTimeout caps at about 24.8 days; an undo window is minutes.
    const t = window.setTimeout(() => {
      setTick((n) => n + 1);
    }, Math.min(left + 50, 2_000_000_000));
    return () => {
      window.clearTimeout(t);
    };
  }, [deadlineMs]);
  return deadlineMs !== null && Date.now() < deadlineMs;
}
