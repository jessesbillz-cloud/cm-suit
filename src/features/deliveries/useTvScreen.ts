// What the trailer TV needs from the browser (SPEC §13.3): a live clock, the screen kept awake (Wake Lock API, where
// the browser has it), full screen while it is up, and lists that page through when a busy day overflows the screen.
import { useEffect, useRef, useState, type RefObject } from 'react';
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

/** How long each screenful of a long list stays up before the next one. */
const PAGE_MS = 8000;

/**
 * A TV list that holds more than the screen shows: it scrolls (by hand too) and turns a page by itself every few
 * seconds, back to the top after the last. `more` says whether anything is out of view, so the screen can say so.
 */
export function useTvPaging<T extends HTMLElement>(): { ref: RefObject<T>; more: boolean } {
  const ref = useRef<T>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setMore(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    const t = window.setInterval(() => {
      check();
      if (el.scrollHeight <= el.clientHeight + 1) return;
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      el.scrollTo({ top: atEnd ? 0 : el.scrollTop + el.clientHeight, behavior: 'smooth' });
    }, PAGE_MS);
    return () => {
      observer.disconnect();
      window.clearInterval(t);
    };
  }, []);
  return { ref, more };
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
