// The rail's pop-outs (More's menu, the job's Edit panel) sit beside the button that opened them. On a short window one
// could run past the bottom or the top; it moves just enough to fit, measured once as it opens, before it paints.
import { useLayoutEffect, type RefObject } from 'react';

const MARGIN = 8;

/** How far to move a box (px, negative = up) so it sits inside a window this tall, its top winning if it can't fit. */
export function fitShift(top: number, bottom: number, windowHeight: number): number {
  let shift = 0;
  if (bottom > windowHeight - MARGIN) shift = windowHeight - MARGIN - bottom;
  if (top + shift < MARGIN) shift = MARGIN - top;
  return shift;
}

/** Keeps an open pop-out inside the window (give it a max height of the window less 1rem, and let it scroll). */
export function useFitInWindow(ref: RefObject<HTMLElement | null>, open: boolean): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    el.style.transform = '';
    const r = el.getBoundingClientRect();
    const shift = fitShift(r.top, r.bottom, window.innerHeight);
    el.style.transform = shift === 0 ? '' : `translateY(${String(shift)}px)`;
  }, [ref, open]);
}
