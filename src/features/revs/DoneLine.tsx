// A finished thing folded to one quiet line (Jesse, Oct 10: "a more distinctive and semi non-clickable area when the
// area has been signed off completely ... I like things to collapse if we can"): a green check (lib/status), what it is
// ("Rev 0 · TOW", or a wall's tag and name), what finished it ("Done · 0040"), on the page's tint, not a row of
// buttons. One tap opens it; Fold closes it again. A rev line on a wall (WallItemChips) and a wall on its room's page
// (RoomWallRow) fold this way; closed by default.
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, CircleCheck } from 'lucide-react';
import { Icon } from '../../ui/Icon';

/** Done's words and check: lib/status's approved green. */
export const DONE_TEXT = 'text-[color:var(--status-approved-fg)]';

interface DoneLineProps {
  /** What it is: "Rev 0 · TOW", or a wall's tag and name. */
  label: ReactNode;
  /** "Done · 0040". */
  text: string;
  onOpen: () => void;
  /** The whole line spoken: "Rev 0 · TOW: Done · 0040". */
  name: string;
  testId: string;
}

export function DoneLine({ label, text, onOpen, name, testId }: DoneLineProps) {
  return (
    <button
      type="button"
      aria-expanded={false}
      aria-label={name}
      title={name}
      data-testid={testId}
      className="relative flex min-h-10 w-full items-center gap-2 rounded-md bg-page px-2.5 py-1.5 text-left hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent sm:min-h-8"
      onClick={onOpen}
    >
      <Icon icon={CircleCheck} size={16} className={`shrink-0 ${DONE_TEXT}`} />
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">{label}</span>
      <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${DONE_TEXT}`} data-testid="rev-done-text">
        {text}
      </span>
      <Icon icon={ChevronDown} size={16} className="shrink-0 text-ink-3" />
    </button>
  );
}

/** Folds an opened done line back to one line. */
export function FoldButton({ onFold, testId }: { onFold: () => void; testId: string }) {
  return (
    <button
      type="button"
      aria-expanded
      aria-label="Fold"
      title="Fold"
      data-testid={testId}
      className="relative -my-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-page hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:h-8 sm:w-8"
      onClick={onFold}
    >
      <Icon icon={ChevronUp} size={16} />
    </button>
  );
}
