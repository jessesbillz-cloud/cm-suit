// What the trailer TV needs from the browser (SPEC §13.3): a live clock, the screen kept awake (Wake Lock API, where
// the browser has it) and full screen while it is up.
import { useEffect, useState } from 'react';
import { todayInZone } from '../../lib/dates';

/** The current time, ticking every second. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      window.clearInterval(t);
    };
  }, []);
  return now;
}

/** The job's day, following the clock (a TV left on overnight moves to the new day by itself). */
export function useToday(tz: string): string {
  return todayInZone(tz, useNow());
}

/**
 * Keeps the screen awake while mounted. The browser drops the lock when the tab is hidden, so it is taken again when
 * the tab comes back. Browsers without the API (or that refuse it) keep their normal sleep; that is logged, not shown.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (stopped) void l.release();
          else lock = l;
        },
        (e: unknown) => {
          console.warn('Screen wake lock not granted', e);
        },
      );
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', take);
      if (lock) void lock.release();
    };
  }, []);
}

/** Asks for full screen (call from a tap); leaving TV mode leaves full screen. */
export function enterFullScreen(): void {
  const el = document.documentElement;
  // iPhone Safari has no element full screen: the TV page still fills the browser.
  if (document.fullscreenElement !== null || !('requestFullscreen' in el)) return;
  el.requestFullscreen().catch((e: unknown) => {
    console.warn('Full screen not granted', e);
  });
}

export function leaveFullScreen(): void {
  if (document.fullscreenElement === null) return;
  document.exitFullscreen().catch((e: unknown) => {
    console.warn('Could not leave full screen', e);
  });
}
