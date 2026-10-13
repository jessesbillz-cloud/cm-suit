// A wall's items (itemLines) on its Walls tile (Jesse, Oct 8: "each of those inspectable items should be on that first
// page"): per rev it needs, the rev written out ("Rev 1 · HOW - Cavity") over its items as boxes, each the whole box in
// its state (StateBox: passed green with its OFS number, requested gold, failed red, open white). Items not applicable
// on the wall are not shown. Every box does something: the caller says what (a passed one with its OFS IR on file
// opens it, the rest the wall at that item). Each says its whole name when spoken or hovered. The boxes sit over the
// card's stretched open button; the rest of the card still opens the wall.
import { boxState } from './boxLook';
import { itemChipName, itemChipText, type ItemChip, type ItemLine } from './itemLines';
import { StateBox } from './StateBox';

interface WallItemChipsProps {
  lines: readonly ItemLine[];
  onChip: (chip: ItemChip) => void;
  className?: string | undefined;
}

export function WallItemChips({ lines, onChip, className = '' }: WallItemChipsProps) {
  if (lines.length === 0) return null;
  return (
    <div role="group" aria-label="Items" className={`relative flex flex-col gap-2.5 ${className}`} data-testid="rev-items">
      {lines.map((line) => (
        <div key={line.rev.id} className="flex flex-col gap-1" data-testid={`rev-line-${String(line.rev.number)}`}>
          <span className="break-words text-[14px] font-semibold leading-5 text-ink-2" data-testid="rev-line-label">
            {line.label}
          </span>
          <span className="flex min-w-0 flex-wrap gap-1.5">
            {line.chips.map((c) => (
              <StateBox
                key={c.item.id}
                state={boxState(c.status) ?? 'open'}
                label={itemChipText(c)}
                name={itemChipName(c)}
                size="md"
                testId={`rev-item-chip-${c.item.id}`}
                status={c.status}
                statusOnBox
                data={{ 'data-file': c.fileId !== null ? 'true' : undefined }}
                onClick={() => {
                  onChip(c);
                }}
              />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
