// A wall's items (itemLines) on its room's row and its Walls tile (Jesse, Oct 8: "each of those inspectable items should
// be on that first page"): per rev, the rev written out ("Rev 1 · HOW - Cavity") over its items as chips in their colors
// (lib/status only: passed green with its OFS number, requested gold, failed red, open plain, N/A muted). Every chip does
// something: the caller says what (a passed one with its OFS IR on file opens it, the rest the wall at that item). Each
// says its whole name when spoken or hovered. A rev whose items all passed or are N/A folds to one done line (Jesse, Oct
// 10: DoneLine), a tap opens it, Fold closes it; while a manager edits, every line is open, the chip being edited is
// ringed and those that can't change are dimmed. The chips sit over the card's stretched open button; the rest of the
// card still opens the wall.
import { useState } from 'react';
import { DoneLine, FoldButton } from './DoneLine';
import { doneText, lineDone } from './done';
import { chipLook, chipOf } from './model';
import { itemChipName, itemChipText, type ItemChip, type ItemLine } from './itemLines';

interface WallItemChipsProps {
  lines: readonly ItemLine[];
  onChip: (chip: ItemChip) => void;
  /** A manager editing: every line open, these chips only can be tapped, this one ringed. */
  edit?: { canTap: (chip: ItemChip) => boolean; focusId: string | null } | undefined;
  className?: string | undefined;
}

interface ChipProps {
  chip: ItemChip;
  onChip: (chip: ItemChip) => void;
  disabled: boolean;
  focused: boolean;
}

function ChipButton({ chip, onChip, disabled, focused }: ChipProps) {
  const name = itemChipName(chip);
  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      disabled={disabled}
      aria-current={focused ? 'true' : undefined}
      data-testid={`rev-item-chip-${chip.item.id}`}
      data-status={chip.status}
      data-file={chip.fileId !== null ? 'true' : undefined}
      className={`relative inline-flex min-h-10 max-w-full items-center break-words rounded-md border px-2.5 py-1 text-left text-[13px] font-medium leading-4 hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50 disabled:hover:brightness-100 sm:min-h-8 ${focused ? 'outline outline-2 outline-offset-1 outline-accent' : ''}`}
      style={chipLook(chipOf(chip.status).key, chip.status === 'open' || chip.status === 'na' ? chip.status : 'set')}
      onClick={() => {
        onChip(chip);
      }}
    >
      <span className="min-w-0 break-words tabular-nums">{itemChipText(chip)}</span>
    </button>
  );
}

interface LineProps {
  line: ItemLine;
  onChip: (chip: ItemChip) => void;
  edit: WallItemChipsProps['edit'];
}

function RevLine({ line, onChip, edit }: LineProps) {
  const [opened, setOpened] = useState(false);
  const done = lineDone(line);
  const testId = `rev-line-${String(line.rev.number)}`;
  const label = (
    <span className="break-words text-[14px] font-medium leading-5 text-ink-2" data-testid="rev-line-label">
      {line.label}
    </span>
  );
  if (done && !opened && !edit) {
    const text = doneText(line.chips);
    return (
      <div className="flex flex-col" data-testid={testId} data-done="true">
        <DoneLine label={label} text={text} name={`${line.label}: ${text}`} testId="rev-line-open" onOpen={() => { setOpened(true); }} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1" data-testid={testId} data-done={done ? 'true' : undefined} data-open={done ? 'true' : undefined}>
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1">{label}</span>
        {done && !edit ? <FoldButton testId="rev-line-fold" onFold={() => { setOpened(false); }} /> : null}
      </span>
      <span className="flex min-w-0 flex-wrap gap-1">
        {line.chips.map((c) => (
          <ChipButton key={c.item.id} chip={c} onChip={onChip} disabled={edit ? !edit.canTap(c) : false} focused={edit?.focusId === c.item.id} />
        ))}
      </span>
    </div>
  );
}

export function WallItemChips({ lines, onChip, edit, className = '' }: WallItemChipsProps) {
  if (lines.length === 0) return null;
  return (
    <div role="group" aria-label="Items" className={`flex flex-col gap-2.5 ${className}`} data-testid="rev-items">
      {lines.map((line) => (
        <RevLine key={line.rev.id} line={line} onChip={onChip} edit={edit} />
      ))}
    </div>
  );
}
