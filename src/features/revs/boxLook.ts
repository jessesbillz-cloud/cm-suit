// One look for every item and rev box on the inspection cards (Jesse, Oct 12: "If an item is signed off, the whole box
// should be green, not just a little dot"; Oct 23: "I need a better way of knowing what these colors mean"): the state
// fills the whole box with lib/status's card color (CARD_STATE: signed off green, asked for blue, failed red), needed
// is a white box with a strong edge, and not needed is not shown at all (Setup shows it, grey). Picked (for a request)
// is black, like every pick (Oct 23: the accent red would read as failed). Pure; tested in boxLook.test.ts.
import type { CSSProperties } from 'react';
import type { RevStatusRow } from '../../data/revs.types';
import { CARD_STATE, type CardState } from '../../lib/status';

/** What a box shows. N/A has no box. */
export type BoxState = 'passed' | 'requested' | 'failed' | 'open';

/** Each box state as the card says it (lib/status). */
const CARD_OF: Record<BoxState, CardState> = { passed: 'signed_off', requested: 'asked_for', failed: 'failed', open: 'needed' };

/** A cell's status as a box; N/A: null (it is not shown). */
export function boxState(status: RevStatusRow['status']): BoxState | null {
  return status === 'na' ? null : status;
}

interface BoxLook {
  className: string;
  style: CSSProperties | undefined;
}

/** A card state's fill, text and edge: needed white with a strong edge, not needed grey, the rest their solid color. */
export function cardLook(state: CardState): BoxLook {
  const k = CARD_STATE[state].key;
  if (state === 'needed') return { className: 'bg-card text-ink', style: { borderColor: `var(--status-${k}-fg)` } };
  if (state === 'not_needed') {
    return { className: '', style: { background: `var(--status-${k}-bg)`, color: `var(--status-${k}-fg)`, borderColor: `var(--status-${k}-bg)` } };
  }
  return { className: '', style: { background: `var(--status-${k}-solid)`, color: `var(--status-${k}-on-solid)`, borderColor: `var(--status-${k}-solid)` } };
}

/** The box's fill, text and edge: picked black, else its card state's. */
export function boxLook(state: BoxState, picked = false): BoxLook {
  if (picked) return { className: 'border-ink bg-ink text-white', style: undefined };
  return cardLook(CARD_OF[state]);
}

/** Its word, spoken and on hover (a failed one says what comes next). */
export const BOX_WORD: Record<BoxState, string> = {
  passed: CARD_STATE.signed_off.label,
  requested: CARD_STATE.asked_for.label,
  failed: `${CARD_STATE.failed.label} — needs re-inspection`,
  open: CARD_STATE.needed.label,
};
