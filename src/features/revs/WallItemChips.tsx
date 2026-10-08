// A wall's items (itemLines) on its room's row and its Walls tile (Jesse, Oct 8: "each of those inspectable items should
// be on that first page"): per rev, the rev written out ("Rev 1 · HOW - Cavity") over its items as chips in their colors
// (lib/status only: passed green with its OFS number, requested gold, failed red, open plain, N/A muted). Every chip does
// something: the caller says what (a passed one with its OFS IR on file opens it, the rest the wall at that item). Each
// says its whole name when spoken or hovered. The chips sit over the card's stretched open button; the rest of the card
// still opens the wall.
import { chipLook, chipOf } from './model';
import { itemChipName, itemChipText, type ItemChip, type ItemLine } from './itemLines';

interface WallItemChipsProps {
  lines: readonly ItemLine[];
  onChip: (chip: ItemChip) => void;
  className?: string | undefined;
}

export function WallItemChips({ lines, onChip, className = '' }: WallItemChipsProps) {
  if (lines.length === 0) return null;
  return (
    <div role="group" aria-label="Items" className={`flex flex-col gap-2.5 ${className}`} data-testid="rev-items">
      {lines.map((line) => (
        <div key={line.rev.id} className="flex flex-col gap-1" data-testid={`rev-line-${String(line.rev.number)}`}>
          <span className="break-words text-[14px] font-medium leading-5 text-ink-2" data-testid="rev-line-label">
            {line.label}
          </span>
          <span className="flex min-w-0 flex-wrap gap-1">
            {line.chips.map((c) => {
              const name = itemChipName(c);
              return (
                <button
                  key={c.item.id}
                  type="button"
                  aria-label={name}
                  title={name}
                  data-testid={`rev-item-chip-${c.item.id}`}
                  data-status={c.status}
                  data-file={c.fileId !== null ? 'true' : undefined}
                  className="relative inline-flex min-h-10 max-w-full items-center break-words rounded-md border px-2.5 py-1 text-left text-[13px] font-medium leading-4 hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent sm:min-h-8"
                  style={chipLook(chipOf(c.status).key, c.status === 'open' || c.status === 'na' ? c.status : 'set')}
                  onClick={() => {
                    onChip(c);
                  }}
                >
                  <span className="min-w-0 break-words tabular-nums">{itemChipText(c)}</span>
                </button>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
