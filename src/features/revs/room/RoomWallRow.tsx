// One wall on its room's page (Jesse, Oct 6: "rooms then walls with the revs"; Oct 8: "each of those inspectable items
// should be on that first page"): its tag once and its name, then its items by rev (WallItemChips). A tap on the row
// opens the wall; a passed item with its OFS IR on file opens that, any other item the wall at that item. A wall whose
// every item passed or is N/A folds to one done line (Jesse, Oct 10: DoneLine), a tap opens it, Fold closes it.
// While a manager edits the room: every line is open, they draw the wall's line on the room's picture (only when the
// room has one) and take the wall out of the room (Undo in the toast), and a tap on an item signs it off before the app,
// or changes or takes off its sign-off (WallBefore's form, under the row). Items passed in the app and N/A can't be.
import { useState } from 'react';
import { PenLine, X } from 'lucide-react';
import type { RevSetup } from '../../../data/revs.types';
import type { RevSignoff } from '../../../data/revs.walls';
import { Button } from '../../../ui/Button';
import { DoneLine, FoldButton } from '../DoneLine';
import { itemLines, type ItemChip } from '../itemLines';
import type { StatusIndex } from '../model';
import type { RoomWall } from '../rooms';
import type { SignoffFiles } from '../revStrip';
import { useWallSigning } from '../WallBefore';
import { WallItemChips } from '../WallItemChips';
import { calloutOf } from '../wallPage';

interface RowEdit {
  canDraw: boolean;
  busy: boolean;
  onDraw: () => void;
  onTakeOut: () => void;
}

interface RoomWallRowProps {
  projectId: string;
  wall: RoomWall;
  setup: RevSetup;
  index: StatusIndex;
  files: SignoffFiles;
  /** The job's live sign-offs: what a manager changes. */
  signoffs: readonly RevSignoff[] | undefined;
  /** A manager editing the room: their moves. Null for everyone else, and for a manager not editing. */
  edit: RowEdit | null;
  isPhone: boolean;
  onOpen: () => void;
  onChip: (chip: ItemChip) => void;
}

/** A manager may sign off before the app any item not passed in the app and not N/A. */
const canSign = (chip: ItemChip) => chip.status !== 'na' && (chip.status !== 'passed' || chip.before);

export function RoomWallRow({ projectId, wall, setup, index, files, signoffs, edit, isPhone, onOpen, onChip }: RoomWallRowProps) {
  const { area } = wall;
  const { title, sub } = calloutOf(area.name, area.wall_tag);
  const [opened, setOpened] = useState(false);
  const signing = useWallSigning(projectId, area.id, signoffs);
  const size = isPhone ? 'md' : 'sm';
  const head = (
    <>
      {area.wall_tag ? (
        <span className="text-[13px] font-semibold text-ink-3" data-testid="rev-wall-tag">
          {area.wall_tag}
        </span>
      ) : null}
      <span className="break-words text-[15.5px] font-semibold leading-6 text-ink">{title}</span>
      {sub ? <span className="break-words text-[13px] font-medium text-ink-2">{sub}</span> : null}
    </>
  );
  if (wall.done && !opened && !edit) {
    const said = [area.wall_tag, title, sub].filter(Boolean).join(' ');
    return (
      <li className="px-1 py-1.5" data-testid={`rev-wall-${area.id}`} data-done="true">
        <DoneLine label={head} text="Done" name={`${said}: Done`} testId="rev-wall-unfold" onOpen={() => { setOpened(true); }} />
      </li>
    );
  }
  const tapChip = (chip: ItemChip) => {
    if (!edit) {
      onChip(chip);
      return;
    }
    if (chip.before) signing.change(chip.item.id, chip.item.name, true);
    else signing.sign([chip.item.id], chip.item.name);
  };
  return (
    <li
      className="relative flex flex-col gap-2 px-1 py-2.5 hover:bg-page/60"
      data-testid={`rev-wall-${area.id}`}
      data-failed={wall.count.failed > 0 ? 'true' : undefined}
      data-done={wall.done ? 'true' : undefined}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 self-center text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-accent"
          data-testid="rev-wall-open"
          onClick={onOpen}
        >
          {head}
        </button>
        {edit ? (
          <span className="relative flex shrink-0 items-center">
            {edit.canDraw ? (
              <Button size={size} variant="quiet" icon={PenLine} disabled={edit.busy} data-testid={`rev-room-draw-${area.id}`} onClick={edit.onDraw}>
                {wall.link.line ? 'Redraw' : 'Draw'}
              </Button>
            ) : null}
            <Button
              size={size}
              variant="quiet"
              icon={X}
              aria-label={`Take ${title} out of the room`}
              title="Take out"
              disabled={edit.busy}
              data-testid={`rev-room-out-${area.id}`}
              onClick={edit.onTakeOut}
            />
          </span>
        ) : wall.done ? (
          <FoldButton testId="rev-wall-fold" onFold={() => { setOpened(false); }} />
        ) : null}
      </div>
      <WallItemChips lines={itemLines(setup, index, area, files)} onChip={tapChip} edit={edit ? { canTap: canSign, focusId: signing.openItem } : undefined} />
      {edit && signing.form ? <div className="relative">{signing.form}</div> : null}
    </li>
  );
}
