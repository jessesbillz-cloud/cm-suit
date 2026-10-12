// A wall's bubble (Jesse, Oct 12: "those bubbles that you can follow"): a card-colored pill with the wall's state-color
// dot and its name. The same look on the plan or room picture (PlanWalls) and on the room's rows (RoomWallRow), so a
// bubble on the picture is found again below it.

/** The pill: the callout's box on a picture, the lead of a row. */
export const BUBBLE = 'flex items-start gap-1.5 rounded-md bg-card/95 px-2 py-1 text-left text-[12px] font-semibold leading-[15px] text-ink shadow-card';

export function BubbleFace({ color, name }: { color: string; name: string }) {
  return (
    <>
      <span aria-hidden className="mt-[4px] h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 break-words" data-testid="wall-bubble-name">
        {name}
      </span>
    </>
  );
}
