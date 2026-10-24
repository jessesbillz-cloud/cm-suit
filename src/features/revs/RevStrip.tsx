// A wall's revs as one strip of boxes (revStrip): on a room's rows by the rev's name (Jesse, Oct 11: "bubbles you
// click" for each wall, a tap opens the wall on its model). The wall's own page has its revs once, with their items
// (WallItems; Jesse, Oct 12), and the Walls tiles show its items instead (WallItemChips). Each box is filled with its
// state (StateBox, Jesse Oct 12: "the whole box should be green"): done green with a check, asked for blue, failed red,
// open white. A rev the wall doesn't need has no box. Every box does something: the caller says what (a done one with
// its OFS IR on file opens it, the rest the wall). Each says it all when spoken or hovered.
import { chipName, chipText, markBox, type ChipLabel, type StripChip } from './revStrip';
import { StateBox } from './StateBox';

interface RevStripProps {
  chips: readonly StripChip[];
  onChip: (chip: StripChip) => void;
  /** What each box says: its number (default), its name, or both. */
  label?: ChipLabel | undefined;
  className?: string | undefined;
  testId?: string | undefined;
}

export function RevStrip({ chips, onChip, label = 'number', className = '', testId = 'rev-strip' }: RevStripProps) {
  if (chips.length === 0) return null;
  return (
    <div role="group" aria-label="Revs" className={`flex flex-wrap gap-1.5 ${className}`} data-testid={testId}>
      {chips.map((c) => (
        <StateBox
          key={c.rev.id}
          state={markBox(c.mark)}
          label={chipText(c, label)}
          name={chipName(c)}
          size="md"
          testId={`rev-chip-${String(c.rev.number)}`}
          data={{ 'data-mark': c.mark, 'data-file': c.fileId !== null ? 'true' : undefined }}
          onClick={() => {
            onChip(c);
          }}
        />
      ))}
    </div>
  );
}
