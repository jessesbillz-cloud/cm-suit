// A wall's revs as one strip of chips (revStrip), on the wall's own page (its room's rows and the Walls tiles show its
// items instead: WallItemChips). Colors only from lib/status: done green with its OFS number, requested gold, failed
// red, open plain, N/A muted.
// Every chip does something: the caller says what (a done chip with its OFS IR on file opens it, the rest the wall).
// Compact chips say the rev's number; on the wall's page, its name too. Each says it all when spoken or hovered.
import { chipLook } from './model';
import { chipKey, chipName, chipText, type StripChip } from './revStrip';

interface RevStripProps {
  chips: readonly StripChip[];
  onChip: (chip: StripChip) => void;
  /** The rev's name beside its number (the wall's page). */
  withNames?: boolean | undefined;
  className?: string | undefined;
  testId?: string | undefined;
}

export function RevStrip({ chips, onChip, withNames = false, className = '', testId = 'rev-strip' }: RevStripProps) {
  if (chips.length === 0) return null;
  return (
    <div role="group" aria-label="Revs" className={`flex flex-wrap gap-1 ${className}`} data-testid={testId}>
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
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border px-2 text-[13px] font-semibold tabular-nums leading-4 hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent sm:min-h-8 sm:min-w-8"
            style={chipLook(chipKey(c.mark), c.mark === 'open' || c.mark === 'na' ? c.mark : 'set')}
            onClick={() => {
              onChip(c);
            }}
          >
            {chipText(c, withNames)}
          </button>
        );
      })}
    </div>
  );
}
