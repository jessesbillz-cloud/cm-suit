// One wall on its room's page (Jesse, Oct 6: "rooms then walls with the revs"; Oct 8: "each of those inspectable items
// should be on that first page"): its tag once and its name, then its items by rev (WallItemChips). A tap on the row
// opens the wall; a passed item with its OFS IR on file opens that, any other item the wall at that item. A manager
// draws the wall's line on the room's picture (only when the room has one) and takes the wall out of the room (a quiet
// icon; Undo in the toast).
import { PenLine, X } from 'lucide-react';
import type { RevSetup } from '../../../data/revs.types';
import { Button } from '../../../ui/Button';
import { itemLines, type ItemChip } from '../itemLines';
import type { StatusIndex } from '../model';
import type { RoomWall } from '../rooms';
import type { SignoffFiles } from '../revStrip';
import { WallItemChips } from '../WallItemChips';
import { calloutOf } from '../wallPage';

interface RoomWallRowProps {
  wall: RoomWall;
  setup: RevSetup;
  index: StatusIndex;
  files: SignoffFiles;
  /** A manager's moves; none for readers. */
  manage: { canDraw: boolean; busy: boolean; onDraw: () => void; onTakeOut: () => void } | null;
  isPhone: boolean;
  onOpen: () => void;
  onChip: (chip: ItemChip) => void;
}

export function RoomWallRow({ wall, setup, index, files, manage, isPhone, onOpen, onChip }: RoomWallRowProps) {
  const { area } = wall;
  const { title, sub } = calloutOf(area.name, area.wall_tag);
  const size = isPhone ? 'md' : 'sm';
  return (
    <li
      className="relative flex flex-col gap-2 px-1 py-2.5 hover:bg-page/60"
      data-testid={`rev-wall-${area.id}`}
      data-failed={wall.count.failed > 0 ? 'true' : undefined}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 self-center text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-accent"
          data-testid="rev-wall-open"
          onClick={onOpen}
        >
          {area.wall_tag ? (
            <span className="text-[13px] font-semibold text-ink-3" data-testid="rev-wall-tag">
              {area.wall_tag}
            </span>
          ) : null}
          <span className="break-words text-[15.5px] font-semibold leading-6 text-ink">{title}</span>
          {sub ? <span className="break-words text-[13px] font-medium text-ink-2">{sub}</span> : null}
        </button>
        {manage ? (
          <span className="relative flex shrink-0 items-center">
            {manage.canDraw ? (
              <Button size={size} variant="quiet" icon={PenLine} disabled={manage.busy} data-testid={`rev-room-draw-${area.id}`} onClick={manage.onDraw}>
                {wall.link.line ? 'Redraw' : 'Draw'}
              </Button>
            ) : null}
            <Button
              size={size}
              variant="quiet"
              icon={X}
              aria-label={`Take ${title} out of the room`}
              title="Take out"
              disabled={manage.busy}
              data-testid={`rev-room-out-${area.id}`}
              onClick={manage.onTakeOut}
            />
          </span>
        ) : null}
      </div>
      <WallItemChips lines={itemLines(setup, index, area, files)} onChip={onChip} />
    </li>
  );
}
