// The wall page is one scroll (Jesse, Oct 23: "I don't like the double scrolling"): the 3-D wall sits at the top and
// the revs scroll under it with the page. A tap on an item box far down still lands somewhere you can see (Jesse,
// Oct 5: "I clicked on it and nothing happened"): when most of the drawing is off screen, the page brings it back
// (smoothly unless the person asked for less motion). Nothing moves when the drawing is already in view.
import { useRef } from 'react';

/** How much of the drawing has to be on screen to count as seen. */
const SEEN = 0.6;

/** The part of the window the element's scroller shows (the page's own, or the pane it scrolls in). */
function shownBand(el: HTMLElement): { top: number; bottom: number } {
  for (let p = el.parentElement; p !== null; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === 'auto' || y === 'scroll') {
      const r = p.getBoundingClientRect();
      return { top: Math.max(r.top, 0), bottom: Math.min(r.bottom, window.innerHeight) };
    }
  }
  return { top: 0, bottom: window.innerHeight };
}

export function useShowWall() {
  const ref = useRef<HTMLDivElement | null>(null);
  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const band = shownBand(el);
    const seen = Math.max(0, Math.min(r.bottom, band.bottom) - Math.max(r.top, band.top));
    if (r.height === 0 || seen / r.height >= SEEN) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
  };
  return [ref, show] as const;
}
