// The request picker's walls, the way My Daily Reports lays out a Special inspection's kinds: one button per wall that
// just says which wall (its callout: a room number or a descriptive name), by level under a thin level label. Any
// number; a tap picks, a second tap drops. Names wrap, never cut.
import { ChipPick } from '../../ui/ChipPick';
import type { LevelGroup } from './revPick';

/** The thin label over a group of buttons (a level, a rev). */
export const GROUP_LABEL = 'text-xs font-bold uppercase leading-4 tracking-[0.06em] text-ink';

interface RevWallsProps {
  groups: readonly LevelGroup[];
  picked: readonly string[];
  /** Every picked wall after a tap. */
  onChange: (areaIds: string[]) => void;
}

export function RevWalls({ groups, picked, onChange }: RevWallsProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="rev-walls-pick">
      {groups.map((g) => {
        const here = new Set(g.areas.map((a) => a.id));
        return (
          <div key={g.level} className="flex flex-col gap-1.5">
            <span aria-hidden className={GROUP_LABEL}>
              {g.level}
            </span>
            <ChipPick
              label={g.level}
              multiple
              chips={g.areas.map((a) => ({ value: a.id, label: a.name }))}
              picked={picked.filter((id) => here.has(id))}
              onChange={(next) => {
                onChange([...picked.filter((id) => !here.has(id)), ...next]);
              }}
              testId="rev-wall"
            />
          </div>
        );
      })}
    </div>
  );
}
