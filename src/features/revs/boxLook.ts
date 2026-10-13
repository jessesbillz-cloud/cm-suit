// One look for every item and rev box on the inspection cards (Jesse, Oct 12: "If an item is signed off, the whole box
// should be green, not just a little dot"): the state fills the whole box with its lib/status solid color (passed green,
// requested gold, failed red), open is a white box with a strong edge, and N/A is not shown at all. Picked (for a
// request, or on a room's card) is the accent. Pure; tested in boxLook.test.ts.
import type { CSSProperties } from 'react';
import type { RevStatusRow } from '../../data/revs.types';
import type { StatusKey } from '../../lib/status';

/** What a box shows. N/A has no box. */
export type BoxState = 'passed' | 'requested' | 'failed' | 'open';

const SOLID: Record<Exclude<BoxState, 'open'>, StatusKey> = { passed: 'approved', requested: 'pending', failed: 'not_approved' };

/** A cell's status as a box; N/A: null (it is not shown). */
export function boxState(status: RevStatusRow['status']): BoxState | null {
  return status === 'na' ? null : status;
}

interface BoxLook {
  className: string;
  style: CSSProperties | undefined;
}

/** The box's fill, text and edge: picked the accent, open white with a strong edge, the rest their solid color. */
export function boxLook(state: BoxState, picked = false): BoxLook {
  if (picked) return { className: 'border-accent bg-accent text-white', style: undefined };
  if (state === 'open') return { className: 'bg-card text-ink', style: { borderColor: 'var(--status-step_ahead-fg)' } };
  const k = SOLID[state];
  return {
    className: '',
    style: { background: `var(--status-${k}-solid)`, color: `var(--status-${k}-on-solid)`, borderColor: `var(--status-${k}-solid)` },
  };
}

/** Its word, spoken and on hover. */
export const BOX_WORD: Record<BoxState, string> = { passed: 'Passed', requested: 'Requested', failed: 'Failed', open: 'Open' };
