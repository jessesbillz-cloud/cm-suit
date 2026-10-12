// One wall on its room's page (Jesse, Oct 6: "rooms then walls with the revs"; Oct 11: one row of bubbles you click,
// not every item written out; Oct 12: the wall's bubble from the room's picture leads its row, so the two match): its
// bubble (BubbleFace, its state's dot and its short name), its tag and grid small, then one bubble per rev by the rev's
// name in its state's color (RevStrip). A tap on the row opens the wall; a done rev with its OFS IR on file opens that,
// any other rev the wall at that rev's first item. A manager draws the wall's line on the room's picture (only when the
// room has one) and takes the wall out of the room (a quiet icon; Undo in the toast).
import { PenLine, X } from 'lucide-react';
import type { RevSetup } from '../../../data/revs.types';
import { Button } from '../../../ui/Button';
import type { StatusIndex } from '../model';
import type { RoomWall } from '../rooms';
import { revStrip, type SignoffFiles, type StripChip } from '../revStrip';
import { RevStrip } from '../RevStrip';
import { calloutOf } from '../wallPage';
import { BUBBLE, BubbleFace } from '../plan/BubbleFace';

interface RoomWallRowProps {
  wall: RoomWall;
  setup: RevSetup;
  index: StatusIndex;
  files: SignoffFiles;
  /** A manager's moves; none for readers. */
  manage: { canDraw: boolean; busy: boolean; onDraw: () => void; onTakeOut: () => void } | null;
  isPhone: boolean;
  onOpen: () => void;
  onChip: (chip: StripChip) => void;
}

export function RoomWallRow({ wall, setup, index, files, manage, isPhone, onOpen, onChip }: RoomWallRowProps) {
  const { area, title } = wall;
  const { sub } = calloutOf(area.name, area.wall_tag);
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
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 self-center text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-accent"
          data-testid="rev-wall-open"
          onClick={onOpen}
        >
          <span className={BUBBLE} data-testid="rev-wall-bubble">
            <BubbleFace color={wall.color} name={title} />
          </span>
          {area.wall_tag ? (
            <span className="text-[13px] font-semibold text-ink-3" data-testid="rev-wall-tag">
              {area.wall_tag}
            </span>
          ) : null}
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
      <RevStrip className="relative" chips={revStrip(setup, index, area, files)} label="name" onChip={onChip} />
    </li>
  );
}
