// A wall's revs as one strip of chips (revStrip): on a room's rows by the rev's name (Jesse, Oct 11: "bubbles you
// click" for each wall, a tap opens the wall on its model). The wall's own page has its revs once, with their items
// (WallItems; Jesse, Oct 12), and the Walls tiles show its items instead (WallItemChips). Colors only from lib/status: done green (with a check where the chip
// says only the name), requested gold, failed red, open plain, N/A muted.
// Every chip does something: the caller says what (a done chip with its OFS IR on file opens it, the rest the wall).
// Each says it all when spoken or hovered.
import { Check } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { chipLook } from './model';
import { chipKey, chipName, chipText, type ChipLabel, type StripChip } from './revStrip';

interface RevStripProps {
  chips: readonly StripChip[];
  onChip: (chip: StripChip) => void;
  /** What each chip says: its number (default), its name, or both. */
  label?: ChipLabel | undefined;
  className?: string | undefined;
  testId?: string | undefined;
}

export function RevStrip({ chips, onChip, label = 'number', className = '', testId = 'rev-strip' }: RevStripProps) {
  if (chips.length === 0) return null;
  const named = label === 'name';
  return (
    <div role="group" aria-label="Revs" className={`flex flex-wrap ${named ? 'gap-1.5' : 'gap-1'} ${className}`} data-testid={testId}>
      {chips.map((c) => {
        const name = chipName(c);
        return (
          <button
            key={c.rev.id}
            type="button"
            aria-label={name}
            title={name}
            data-testid={`rev-chip-${String(c.rev.number)}`}
            data-mark={c.mark}
            data-file={c.fileId !== null ? 'true' : undefined}
            className={`inline-flex min-h-10 min-w-10 items-center justify-center gap-1 border text-[13px] font-semibold tabular-nums leading-4 hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent sm:min-h-8 sm:min-w-8 ${
              named ? 'rounded-full px-3' : 'rounded-md px-2'
            }`}
            style={chipLook(chipKey(c.mark), c.mark === 'open' || c.mark === 'na' ? c.mark : 'set')}
            onClick={() => {
              onChip(c);
            }}
          >
            {named && c.mark === 'done' ? <Icon icon={Check} size={14} /> : null}
            <span className="break-words">{chipText(c, label)}</span>
          </button>
        );
      })}
    </div>
  );
}
