// One quick phrase as a chip above a note box (0117). A tap adds its text to the note. Holding it (or a right-click)
// opens it to change or remove. A press on it never takes the cursor from the note, so the phrase goes where the
// cursor was.
import { useRef } from 'react';
import type { QuickPhrase } from '../../data/phrases.types';
import { CLICK_BOX } from '../../ui/box';

/** How long a press is a hold (opens the phrase to change it). */
const HOLD_MS = 550;

export const CHIP = `inline-flex min-h-9 items-center gap-1 rounded-full px-3 py-1 text-left text-[13px] font-medium text-ink wrap-anywhere select-none [-webkit-touch-callout:none] sm:min-h-8 ${CLICK_BOX}`;

interface PhraseChipProps {
  phrase: QuickPhrase;
  onTap: () => void;
  onEdit: () => void;
}

export function PhraseChip({ phrase, onTap, onEdit }: PhraseChipProps) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);

  function stop() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  return (
    <button
      type="button"
      className={CHIP}
      title={phrase.body}
      data-testid="phrase-chip"
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        held.current = false;
        stop();
        if (e.pointerType === 'mouse') return;
        timer.current = window.setTimeout(() => {
          held.current = true;
          onEdit();
        }, HOLD_MS);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => {
        e.preventDefault();
        stop();
        held.current = true;
        onEdit();
      }}
      onClick={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        onTap();
      }}
    >
      {phrase.label}
    </button>
  );
}
